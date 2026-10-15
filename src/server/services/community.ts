import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { badRequest, notFound } from '../errors';
import { audit } from '../audit';
import { assertCan, type WorkspaceCtx } from '../auth/ctx';
import { adapterFor } from '../adapters/registry';
import { AdapterError } from '../adapters/types';
import { accountRef } from '../integrations/tokens';
import { syncComments } from './community-sync';

export const commentsQuerySchema = z.object({
  filter: z.enum(['unanswered', 'answered', 'all', 'mine']).default('unanswered'),
  channel: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().optional(),
});

export async function listComments(ctx: WorkspaceCtx, raw: unknown) {
  assertCan(ctx, 'community.view');
  const q = commentsQuerySchema.parse(raw);
  const where: Prisma.CommentWhereInput = {
    workspaceId: ctx.workspace.id,
    isOwn: false,
    hidden: false,
    ...(q.filter === 'unanswered' ? { answered: false } : q.filter === 'answered' ? { answered: true } : q.filter === 'mine' ? { assignedToId: ctx.user.id } : {}),
    ...(q.channel ? { socialAccountId: q.channel } : {}),
    ...(q.q ? { OR: [{ body: { contains: q.q, mode: 'insensitive' } }, { authorName: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [rows, counts] = await Promise.all([
    db.comment.findMany({
      where,
      orderBy: [{ postedAt: 'desc' }, { id: 'desc' }],
      take: 41,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        socialAccount: { select: { id: true, name: true, platform: true, avatarUrl: true } },
        platformPost: { select: { id: true, postId: true, caption: true, customized: true, externalUrl: true, post: { select: { baseCaption: true } } } },
        _count: { select: { notes: true } },
      },
    }),
    db.comment.groupBy({ by: ['answered'], where: { workspaceId: ctx.workspace.id, isOwn: false, hidden: false }, _count: { _all: true } }),
  ]);
  const assigneeIds = [...new Set(rows.map((r) => r.assignedToId).filter((x): x is string => !!x))];
  const assignees = assigneeIds.length ? await db.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true, email: true } }) : [];
  const page = rows.slice(0, 40);
  return {
    counts: {
      unanswered: counts.find((c) => !c.answered)?._count._all ?? 0,
      answered: counts.find((c) => c.answered)?._count._all ?? 0,
    },
    items: page.map((r) => ({
      id: r.id,
      authorName: r.authorName,
      authorHandle: r.authorHandle,
      body: r.body,
      postedAt: r.postedAt.toISOString(),
      answered: r.answered,
      channel: r.socialAccount,
      post: r.platformPost
        ? { id: r.platformPost.postId, caption: r.platformPost.customized ? r.platformPost.caption : r.platformPost.post.baseCaption, externalUrl: r.platformPost.externalUrl }
        : null,
      assignedTo: assignees.find((a) => a.id === r.assignedToId) ?? null,
      noteCount: r._count.notes,
    })),
    nextCursor: rows.length > 40 ? page[page.length - 1]!.id : null,
  };
}

async function loadComment(ctx: WorkspaceCtx, id: string) {
  const c = await db.comment.findFirst({ where: { id, workspaceId: ctx.workspace.id }, include: { socialAccount: true } });
  if (!c) throw notFound('Comment');
  return c;
}

export async function getCommentThread(ctx: WorkspaceCtx, id: string) {
  assertCan(ctx, 'community.view');
  const c = await loadComment(ctx, id);
  const [replies, notes] = await Promise.all([
    db.comment.findMany({ where: { socialAccountId: c.socialAccountId, parentExternalId: c.externalId }, orderBy: { postedAt: 'asc' } }),
    db.internalNote.findMany({ where: { commentId: c.id }, orderBy: { createdAt: 'asc' }, include: { author: { select: { name: true, email: true } } } }),
  ]);
  const caps = adapterFor(c.socialAccount).capabilities(c.socialAccount);
  return {
    canReplyOnPlatform: caps.replyToComments && c.socialAccount.status === 'CONNECTED',
    replies: replies.map((r) => ({ id: r.id, authorName: r.authorName, body: r.body, isOwn: r.isOwn, postedAt: r.postedAt.toISOString() })),
    notes: notes.map((n) => ({ id: n.id, body: n.body, author: n.author?.name ?? n.author?.email ?? 'Former member', createdAt: n.createdAt.toISOString() })),
  };
}

export async function replyToComment(ctx: WorkspaceCtx, id: string, text: string) {
  assertCan(ctx, 'community.reply');
  const body = text.trim();
  if (!body) throw badRequest('Write a reply first.');
  if (body.length > 2000) throw badRequest('Replies can be at most 2,000 characters.');
  const c = await loadComment(ctx, id);
  const adapter = adapterFor(c.socialAccount);
  if (!adapter.capabilities(c.socialAccount).replyToComments) {
    throw badRequest(`Replying isn't available for ${c.socialAccount.name}. Reconnect it and allow comment permissions.`);
  }
  if (c.socialAccount.status !== 'CONNECTED') throw badRequest(`Reconnect ${c.socialAccount.name} before replying.`);
  let externalId: string;
  try {
    ({ externalId } = await adapter.replyToComment(await accountRef(c.socialAccount), c.externalId, body));
  } catch (err) {
    if (err instanceof AdapterError && err.kind === 'auth') {
      await db.socialAccount.update({ where: { id: c.socialAccountId }, data: { status: 'NEEDS_REAUTH', lastError: err.message } });
    }
    throw badRequest(err instanceof Error ? err.message : 'The platform rejected the reply.');
  }
  await db.$transaction([
    db.comment.create({
      data: {
        workspaceId: ctx.workspace.id,
        socialAccountId: c.socialAccountId,
        platformPostId: c.platformPostId,
        externalId,
        parentExternalId: c.externalId,
        authorName: c.socialAccount.name,
        body,
        isOwn: true,
        answered: true,
        postedAt: new Date(),
      },
    }),
    db.comment.update({ where: { id: c.id }, data: { answered: true } }),
  ]);
  await audit({ action: 'community.replied', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'comment', targetId: c.id });
  return getCommentThread(ctx, id);
}

export const commentUpdateSchema = z.object({
  answered: z.boolean().optional(),
  assignedToId: z.string().nullable().optional(),
});

export async function updateComment(ctx: WorkspaceCtx, id: string, input: z.infer<typeof commentUpdateSchema>) {
  assertCan(ctx, 'community.reply');
  const data = commentUpdateSchema.parse(input);
  await loadComment(ctx, id);
  if (data.assignedToId) {
    const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: data.assignedToId } } });
    if (!member) throw badRequest('You can only assign workspace members.');
  }
  await db.comment.update({ where: { id }, data });
}

export async function addCommentNote(ctx: WorkspaceCtx, id: string, text: string) {
  assertCan(ctx, 'community.view');
  const body = text.trim();
  if (!body || body.length > 2000) throw badRequest('Notes must be 1–2,000 characters.');
  await loadComment(ctx, id);
  await db.internalNote.create({ data: { workspaceId: ctx.workspace.id, commentId: id, authorId: ctx.user.id, body } });
  return getCommentThread(ctx, id);
}

/** Pulls new comments for this workspace now (otherwise every 30 minutes). */
export async function syncWorkspaceComments(ctx: WorkspaceCtx) {
  assertCan(ctx, 'community.view');
  return syncComments({ workspaceId: ctx.workspace.id });
}

export async function communityStatus(ctx: WorkspaceCtx) {
  const accounts = await db.socialAccount.findMany({ where: { workspaceId: ctx.workspace.id, status: { not: 'DISCONNECTED' } } });
  return accounts.map((a) => {
    const caps = adapterFor(a).capabilities(a);
    return { id: a.id, name: a.name, platform: a.platform, avatarUrl: a.avatarUrl, comments: caps.comments, replies: caps.replyToComments, messages: caps.directMessages, mode: a.mode };
  });
}
