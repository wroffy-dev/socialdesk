import { z } from 'zod';
import { Prisma, type MediaAsset, type PlatformPostStatus, type PostStatus, type PublishMode, type SocialPlatform } from '@prisma/client';
import { db, type Tx } from '../db';
import { badRequest, conflict, forbidden, notFound, validationError } from '../errors';
import { audit } from '../audit';
import { assertCan, type WorkspaceCtx } from '../auth/ctx';
import { enqueuePublish, removePublishJobs } from '../queue/producer';
import { refreshPostStatus } from '../publishing/status';
import { errorsOnly, inferFormat, validateVersion, type Issue, type MediaFacts } from '@/lib/platforms';
import { isValidTimezone } from '@/lib/timezones';
import { isDefaultOptions, normalizeOptions, versionOptionsSchema } from '@/lib/post-options';
import { toDto as mediaDto } from './media';
import { assertWithinLimit, getUsage, getWorkspacePlan, monthStart } from './entitlements';
import { nextFreeQueueSlot } from './queue';
import { adapterFor } from '../adapters/registry';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const id = z.string().min(1).max(40);
const url = z.string().trim().url('Enter a full link starting with https://').max(2000);

export const versionInputSchema = z.object({
  socialAccountId: id,
  customized: z.boolean().default(false),
  caption: z.string().max(70_000).default(''),
  mediaIds: z.array(id).max(10).default([]),
  linkUrl: url.nullable().optional(),
  options: versionOptionsSchema.optional(),
});

export const scheduleActionSchema = z.discriminatedUnion('type', [
  /** Save content and keep the current status/schedule. */
  z.object({ type: z.literal('save') }),
  /** Save as draft (unschedules a scheduled post). */
  z.object({ type: z.literal('draft') }),
  z.object({ type: z.literal('publish_now') }),
  z.object({
    type: z.literal('schedule'),
    scheduledAt: z.string().datetime({ offset: true }),
    timezone: z.string().refine(isValidTimezone, 'Invalid timezone'),
  }),
  z.object({ type: z.literal('queue') }),
]);

export const postInputSchema = z.object({
  /** The project the post belongs to. When omitted it is taken from the chosen channels (or kept on edit). */
  projectId: id.optional(),
  baseCaption: z.string().max(70_000).default(''),
  baseMediaIds: z.array(id).max(10).default([]),
  baseLinkUrl: url.nullable().optional(),
  versions: z.array(versionInputSchema).max(20).default([]),
  tagIds: z.array(id).max(20).default([]),
  notes: z.string().max(2000).nullable().optional(),
  action: scheduleActionSchema.default({ type: 'save' }),
});

export type PostInput = z.input<typeof postInputSchema>;
type ScheduleAction = z.infer<typeof scheduleActionSchema>;

const EDITABLE_POST: PostStatus[] = ['DRAFT', 'SCHEDULED', 'FAILED', 'CANCELLED'];
const LOCKED_VERSION: PlatformPostStatus[] = ['PUBLISHING', 'PUBLISHED', 'NEEDS_VERIFICATION'];
const MIN_LEAD_MS = 60_000;
const MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const detailInclude = {
  project: { select: { id: true, name: true, color: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  tags: { include: { tag: true } },
  versions: {
    orderBy: { createdAt: 'asc' },
    include: {
      socialAccount: { select: { id: true, projectId: true, name: true, username: true, avatarUrl: true, platform: true, status: true, mode: true } },
      media: { orderBy: { position: 'asc' }, include: { mediaAsset: true } },
      attempts: { orderBy: { attemptNumber: 'desc' }, take: 10 },
    },
  },
} satisfies Prisma.SocialPostInclude;

type PostWithDetail = Prisma.SocialPostGetPayload<{ include: typeof detailInclude }>;

async function loadPost(ctx: WorkspaceCtx, postId: string, tx: Tx = db): Promise<PostWithDetail> {
  const post = await tx.socialPost.findFirst({ where: { id: postId, workspaceId: ctx.workspace.id }, include: detailInclude });
  if (!post) throw notFound('Post');
  return post;
}

/**
 * Row-locks a post's versions for the rest of the transaction. The worker claims versions with a
 * conditional UPDATE, so it waits for this transaction and then re-checks status/scheduledAt.
 */
export async function lockVersions(tx: Tx, postId: string) {
  await tx.$queryRaw`SELECT id FROM "PlatformPost" WHERE "postId" = ${postId} FOR UPDATE`;
}

async function loadMediaMap(workspaceId: string, ids: string[], tx: Tx = db) {
  if (ids.length === 0) return new Map<string, MediaAsset>();
  const rows = await tx.mediaAsset.findMany({ where: { id: { in: ids }, workspaceId, deletedAt: null } });
  return new Map(rows.map((r) => [r.id, r]));
}

function toFacts(m: MediaAsset): MediaFacts {
  return { id: m.id, kind: m.kind, mimeType: m.mimeType, sizeBytes: m.sizeBytes, width: m.width, height: m.height, durationSec: m.durationSec };
}

/** The caption/media/link a version will actually publish. */
export function effectiveContent(
  post: { baseCaption: string; baseMediaIds: string[]; baseLinkUrl: string | null },
  version: { customized: boolean; caption: string; linkUrl: string | null; mediaIds: string[] },
) {
  return version.customized
    ? { caption: version.caption, mediaIds: version.mediaIds, linkUrl: version.linkUrl }
    : { caption: post.baseCaption, mediaIds: post.baseMediaIds, linkUrl: post.baseLinkUrl };
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export function toPostDto(post: PostWithDetail, baseMedia: Map<string, MediaAsset>) {
  return {
    id: post.id,
    projectId: post.projectId,
    project: { id: post.project.id, name: post.project.name, color: post.project.color },
    status: post.status,
    baseCaption: post.baseCaption,
    baseMediaIds: post.baseMediaIds,
    baseMedia: post.baseMediaIds.map((m) => baseMedia.get(m)).filter((m): m is MediaAsset => !!m).map(mediaDto),
    baseLinkUrl: post.baseLinkUrl,
    publishMode: post.publishMode,
    scheduledAt: post.scheduledAt?.toISOString() ?? null,
    timezone: post.timezone,
    notes: post.notes,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    createdBy: post.createdBy ? { name: post.createdBy.name ?? post.createdBy.email } : null,
    tags: post.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    versions: post.versions.map((v) => ({
      id: v.id,
      socialAccountId: v.socialAccountId,
      platform: v.platform,
      account: v.socialAccount,
      customized: v.customized,
      caption: v.caption,
      linkUrl: v.linkUrl,
      format: v.format,
      options: normalizeOptions(v.platform, v.options),
      firstComment: { id: v.firstCommentId, error: v.firstCommentError, startedAt: v.firstCommentAt?.toISOString() ?? null },
      status: v.status,
      scheduledAt: v.scheduledAt?.toISOString() ?? null,
      publishedAt: v.publishedAt?.toISOString() ?? null,
      externalId: v.externalId,
      externalUrl: v.externalUrl,
      lastError: v.lastError,
      lastErrorCode: v.lastErrorCode,
      attemptCount: v.attemptCount,
      nextRetryAt: v.nextRetryAt?.toISOString() ?? null,
      media: v.media.map((m) => mediaDto(m.mediaAsset)),
      attempts: v.attempts.map((a) => ({
        id: a.id,
        attemptNumber: a.attemptNumber,
        status: a.status,
        trigger: a.trigger,
        errorCode: a.errorCode,
        errorMessage: a.errorMessage,
        startedAt: a.startedAt.toISOString(),
        finishedAt: a.finishedAt?.toISOString() ?? null,
      })),
    })),
  };
}

export type PostDto = ReturnType<typeof toPostDto>;

export async function getPost(ctx: WorkspaceCtx, postId: string) {
  assertCan(ctx, 'posts.view');
  const post = await loadPost(ctx, postId);
  return toPostDto(post, await loadMediaMap(ctx.workspace.id, post.baseMediaIds));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface VersionIssues {
  socialAccountId: string;
  platform: SocialPlatform;
  accountName: string;
  issues: Issue[];
}

/** Checks every version of a post against its platform's rules and the account's state. */
export async function validatePostVersions(postId: string, tx: Tx = db): Promise<VersionIssues[]> {
  const post = await tx.socialPost.findUniqueOrThrow({
    where: { id: postId },
    include: { versions: { include: { socialAccount: true, media: { orderBy: { position: 'asc' }, include: { mediaAsset: true } } } } },
  });
  const baseMedia = await loadMediaMap(post.workspaceId, post.baseMediaIds, tx);
  return post.versions.map((v) => {
    const media = v.customized ? v.media.map((m) => m.mediaAsset) : post.baseMediaIds.map((m) => baseMedia.get(m)).filter((m): m is MediaAsset => !!m);
    const caption = v.customized ? v.caption : post.baseCaption;
    const linkUrl = v.customized ? v.linkUrl : post.baseLinkUrl;
    const options = normalizeOptions(v.platform, v.options);
    const issues = validateVersion(v.platform, { caption, linkUrl, media: media.filter((m) => !m.deletedAt).map(toFacts) }, options);
    if (media.some((m) => m.deletedAt)) issues.push({ severity: 'error', message: 'A media file in this post was deleted.' });
    if (v.socialAccount.status !== 'CONNECTED') {
      issues.push({ severity: 'error', message: `${v.socialAccount.name} needs to be reconnected before publishing.` });
    } else {
      const caps = adapterFor(v.socialAccount).capabilities({ scopes: v.socialAccount.scopes });
      if (!caps.publish) {
        issues.push({ severity: 'error', message: `${v.socialAccount.name} is missing permission to publish. Reconnect it and allow all requested permissions.` });
      } else if (!caps.formats.includes(inferFormat(v.platform, { caption, linkUrl, media: media.map(toFacts) }, options))) {
        issues.push({ severity: 'error', message: 'This post format is not supported for this channel.' });
      }
      if (options.firstComment.trim() && !caps.firstComment) {
        issues.push({ severity: 'error', message: `${v.socialAccount.name} is missing permission to comment, so the first comment can't be posted. Reconnect it and allow all requested permissions, or remove the first comment.` });
      }
    }
    return { socialAccountId: v.socialAccountId, platform: v.platform, accountName: v.socialAccount.name, issues };
  });
}

async function assertPostQuota(tx: Tx, workspaceId: string, scheduledAt: Date, adding: number, excludePostId: string) {
  const plan = await getWorkspacePlan(workspaceId, tx);
  const start = monthStart(scheduledAt);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const [published, pending] = await Promise.all([
    getUsage(workspaceId, 'posts_published', tx, scheduledAt),
    tx.platformPost.count({
      where: { workspaceId, status: { in: ['SCHEDULED', 'PUBLISHING'] }, scheduledAt: { gte: start, lt: end }, postId: { not: excludePostId } },
    }),
  ]);
  assertWithinLimit(plan, 'posts_per_month', published + pending, adding);
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

export async function createPost(ctx: WorkspaceCtx, input: PostInput) {
  return savePost(ctx, null, input);
}

export async function updatePost(ctx: WorkspaceCtx, postId: string, input: PostInput) {
  return savePost(ctx, postId, input);
}

async function savePost(ctx: WorkspaceCtx, postId: string | null, raw: PostInput) {
  assertCan(ctx, 'posts.edit');
  const input = postInputSchema.parse(raw);
  const wsId = ctx.workspace.id;
  const action = input.action;
  if (action.type !== 'save' && action.type !== 'draft') assertCan(ctx, 'posts.publish');

  // Everything referenced must belong to this workspace.
  const accountIds = [...new Set(input.versions.map((v) => v.socialAccountId))];
  if (accountIds.length !== input.versions.length) throw badRequest('Each channel can only appear once.');
  const accounts = await db.socialAccount.findMany({ where: { id: { in: accountIds }, workspaceId: wsId, status: { not: 'DISCONNECTED' } } });
  if (accounts.length !== accountIds.length) throw notFound('Channel');
  const projectId = await resolveProjectId(wsId, postId, input.projectId, accounts);
  if (accounts.some((a) => a.projectId !== projectId)) throw badRequest('All channels of a post must belong to its project.');
  const allMediaIds = [...new Set([...input.baseMediaIds, ...input.versions.flatMap((v) => v.mediaIds)])];
  const media = await loadMediaMap(wsId, allMediaIds);
  if (media.size !== allMediaIds.length) throw notFound('Media');
  if (input.tagIds.length) {
    const tags = await db.contentTag.count({ where: { id: { in: input.tagIds }, workspaceId: wsId } });
    if (tags !== input.tagIds.length) throw notFound('Tag');
  }

  const removedJobs: { id: string; scheduledAt: Date | null }[] = [];
  const result = await db.$transaction(async (tx) => {
    let post: { id: string; status: PostStatus; scheduledAt: Date | null; publishMode: PublishMode | null; timezone: string | null };
    if (postId) {
      await lockVersions(tx, postId);
      const existing = await tx.socialPost.findFirst({ where: { id: postId, workspaceId: wsId }, include: { versions: true } });
      if (!existing) throw notFound('Post');
      if (!EDITABLE_POST.includes(existing.status)) throw conflict('This post is publishing or already published and can no longer be edited.');
      if (existing.versions.some((v) => LOCKED_VERSION.includes(v.status))) {
        throw conflict('Part of this post is publishing or published. Retry failed channels from the post details instead.');
      }
      await tx.socialPost.update({
        where: { id: existing.id },
        data: {
          projectId,
          baseCaption: input.baseCaption,
          baseMediaIds: input.baseMediaIds,
          baseLinkUrl: input.baseLinkUrl ?? null,
          notes: input.notes ?? null,
        },
      });
      const keep = new Set(accountIds);
      const removed = existing.versions.filter((v) => !keep.has(v.socialAccountId));
      removedJobs.push(...removed.map((v) => ({ id: v.id, scheduledAt: v.scheduledAt })));
      if (removed.length) await tx.platformPost.deleteMany({ where: { id: { in: removed.map((v) => v.id) } } });
      post = existing;
    } else {
      post = await tx.socialPost.create({
        data: {
          workspaceId: wsId,
          projectId,
          createdById: ctx.user.id,
          baseCaption: input.baseCaption,
          baseMediaIds: input.baseMediaIds,
          baseLinkUrl: input.baseLinkUrl ?? null,
          notes: input.notes ?? null,
        },
      });
    }

    // Upsert one version per selected channel.
    for (const v of input.versions) {
      const account = accounts.find((a) => a.id === v.socialAccountId)!;
      const content = effectiveContent(
        { baseCaption: input.baseCaption, baseMediaIds: input.baseMediaIds, baseLinkUrl: input.baseLinkUrl ?? null },
        { customized: v.customized, caption: v.caption, linkUrl: v.linkUrl ?? null, mediaIds: v.mediaIds },
      );
      const options = normalizeOptions(account.platform, v.options);
      const format = inferFormat(
        account.platform,
        { caption: content.caption, linkUrl: content.linkUrl, media: content.mediaIds.map((m) => toFacts(media.get(m)!)) },
        options,
      );
      const data = {
        customized: v.customized,
        caption: v.customized ? v.caption : '',
        linkUrl: v.customized ? (v.linkUrl ?? null) : null,
        format,
        options: isDefaultOptions(options) ? Prisma.DbNull : (options as Prisma.InputJsonValue),
      };
      const version = await tx.platformPost.upsert({
        where: { postId_socialAccountId: { postId: post.id, socialAccountId: v.socialAccountId } },
        create: { ...data, workspaceId: wsId, postId: post.id, socialAccountId: v.socialAccountId, platform: account.platform, status: 'DRAFT' },
        update: data,
      });
      await tx.platformPostMedia.deleteMany({ where: { platformPostId: version.id } });
      if (v.customized && v.mediaIds.length) {
        await tx.platformPostMedia.createMany({ data: v.mediaIds.map((m, i) => ({ platformPostId: version.id, mediaAssetId: m, position: i })) });
      }
    }

    await tx.postTag.deleteMany({ where: { postId: post.id } });
    if (input.tagIds.length) await tx.postTag.createMany({ data: input.tagIds.map((tagId) => ({ postId: post.id, tagId })) });

    const scheduled = await applyAction(ctx, tx, post, action, input.versions.length);
    await refreshPostStatus(post.id, tx);
    return { postId: post.id, scheduled };
  });

  await removePublishJobs([...removedJobs, ...result.scheduled.removed]);
  await enqueuePublish(result.scheduled.added);
  await audit({
    action: postId ? 'post.updated' : 'post.created',
    actorId: ctx.user.id,
    workspaceId: wsId,
    targetType: 'post',
    targetId: result.postId,
    metadata: { action: action.type },
  });
  return getPost(ctx, result.postId);
}

/**
 * The project a saved post belongs to: the one asked for, else the existing post's (on edit), else
 * the chosen channels' project, else the workspace's first project.
 */
async function resolveProjectId(workspaceId: string, postId: string | null, requested: string | undefined, accounts: { projectId: string }[]) {
  if (requested) {
    const p = await db.project.findFirst({ where: { id: requested, workspaceId }, select: { id: true } });
    if (!p) throw notFound('Project');
    return p.id;
  }
  if (postId) {
    const existing = await db.socialPost.findFirst({ where: { id: postId, workspaceId }, select: { projectId: true } });
    if (!existing) throw notFound('Post');
    return existing.projectId;
  }
  if (accounts[0]) return accounts[0].projectId;
  const first = await db.project.findFirst({ where: { workspaceId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } });
  if (!first) throw badRequest('Create a project first.');
  return first.id;
}

/** Moves a post (and its versions) into the state the action asks for. Runs inside the save transaction. */
async function applyAction(
  ctx: WorkspaceCtx,
  tx: Tx,
  post: { id: string; status: PostStatus; scheduledAt: Date | null; publishMode: PublishMode | null; timezone: string | null },
  action: ScheduleAction,
  versionCount: number,
) {
  const versions = await tx.platformPost.findMany({ where: { postId: post.id } });
  const removed = versions.filter((v) => v.status === 'SCHEDULED').map((v) => ({ id: v.id, scheduledAt: v.scheduledAt }));

  if (action.type === 'save') {
    if (post.status === 'SCHEDULED' && post.scheduledAt) {
      // Content of a scheduled post changed: keep its time, re-validate, and make sure new channels are scheduled too.
      return schedule(ctx, tx, post.id, post.scheduledAt, post.publishMode ?? 'SCHEDULED', post.timezone ?? ctx.workspace.timezone, removed);
    }
    if (post.status !== 'DRAFT') {
      // Saving edits to a failed or cancelled post turns it back into a draft.
      await tx.platformPost.updateMany({ where: { postId: post.id }, data: { status: 'DRAFT', scheduledAt: null, nextRetryAt: null } });
      await tx.socialPost.update({ where: { id: post.id }, data: { status: 'DRAFT', scheduledAt: null, publishMode: null } });
    }
    return { added: [], removed: [] };
  }

  if (action.type === 'draft') {
    await tx.platformPost.updateMany({ where: { postId: post.id }, data: { status: 'DRAFT', scheduledAt: null, nextRetryAt: null } });
    await tx.socialPost.update({ where: { id: post.id }, data: { status: 'DRAFT', scheduledAt: null, publishMode: null, timezone: null } });
    return { added: [], removed };
  }

  if (versionCount === 0) throw badRequest('Choose at least one channel.');
  if (!ctx.user.emailVerified) throw forbidden('Verify your email address before publishing.');

  const now = Date.now();
  if (action.type === 'publish_now') return schedule(ctx, tx, post.id, new Date(now), 'NOW', ctx.workspace.timezone, removed);
  if (action.type === 'schedule') {
    const at = new Date(action.scheduledAt);
    if (at.getTime() < now + MIN_LEAD_MS) throw badRequest('Choose a time at least 1 minute in the future, or publish now.');
    if (at.getTime() > now + MAX_AHEAD_MS) throw badRequest('Posts can be scheduled up to one year ahead.');
    return schedule(ctx, tx, post.id, at, 'SCHEDULED', action.timezone, removed);
  }
  // queue
  const slot = await nextFreeQueueSlot(tx, ctx.workspace.id, ctx.workspace.timezone, new Date(now + MIN_LEAD_MS), post.id);
  if (!slot) throw badRequest('Your queue has no free time slots. Add posting times in the queue settings.');
  return schedule(ctx, tx, post.id, slot, 'QUEUE', ctx.workspace.timezone, removed);
}

async function schedule(
  ctx: WorkspaceCtx,
  tx: Tx,
  postId: string,
  at: Date,
  mode: PublishMode,
  timezone: string,
  removed: { id: string; scheduledAt: Date | null }[],
) {
  const issues = await validatePostVersions(postId, tx);
  const failing = issues.filter((v) => errorsOnly(v.issues).length > 0);
  if (failing.length) {
    throw validationError(
      { versions: failing.map((f) => ({ ...f, issues: errorsOnly(f.issues) })) },
      `Fix ${failing.length === 1 ? `the ${failing[0]!.accountName} version` : `${failing.length} channel versions`} before scheduling.`,
    );
  }
  const versions = await tx.platformPost.findMany({ where: { postId }, select: { id: true } });
  await assertPostQuota(tx, ctx.workspace.id, at, versions.length, postId);
  const res = await tx.platformPost.updateMany({
    where: { postId, status: { in: ['DRAFT', 'SCHEDULED', 'FAILED', 'CANCELLED'] } },
    data: { status: 'SCHEDULED', scheduledAt: at, nextRetryAt: null, lastError: null, lastErrorCode: null },
  });
  if (res.count !== versions.length) throw conflict('This post started publishing in the meantime. Refresh to see its status.');
  await tx.socialPost.update({ where: { id: postId }, data: { status: 'SCHEDULED', scheduledAt: at, publishMode: mode, timezone } });
  return { added: versions.map((v) => ({ id: v.id, scheduledAt: at })), removed: removed.filter((r) => r.scheduledAt?.getTime() !== at.getTime()) };
}

/**
 * Schedules an existing post with its saved content (calendar drag of a draft, "publish now"
 * from the list). Content is re-validated exactly as when saving from the composer.
 */
export async function schedulePost(ctx: WorkspaceCtx, postId: string, rawAction: z.input<typeof scheduleActionSchema>) {
  assertCan(ctx, 'posts.publish');
  const action = scheduleActionSchema.parse(rawAction);
  if (action.type === 'save') return getPost(ctx, postId);
  const result = await db.$transaction(async (tx) => {
    await lockVersions(tx, postId);
    const post = await tx.socialPost.findFirst({ where: { id: postId, workspaceId: ctx.workspace.id }, include: { versions: true } });
    if (!post) throw notFound('Post');
    if (!EDITABLE_POST.includes(post.status) || post.versions.some((v) => LOCKED_VERSION.includes(v.status))) {
      throw conflict('This post is publishing or already published.');
    }
    const scheduled = await applyAction(ctx, tx, post, action, post.versions.length);
    await refreshPostStatus(postId, tx);
    return scheduled;
  });
  await removePublishJobs(result.removed);
  await enqueuePublish(result.added);
  await audit({ action: `post.${action.type}`, actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'post', targetId: postId });
  return getPost(ctx, postId);
}

// ---------------------------------------------------------------------------
// Lifecycle actions
// ---------------------------------------------------------------------------

export async function reschedulePost(ctx: WorkspaceCtx, postId: string, scheduledAtIso: string) {
  assertCan(ctx, 'posts.publish');
  const at = new Date(scheduledAtIso);
  if (Number.isNaN(at.getTime())) throw badRequest('Invalid date.');
  if (at.getTime() < Date.now() + MIN_LEAD_MS) throw badRequest("You can't move a post into the past.");
  if (at.getTime() > Date.now() + MAX_AHEAD_MS) throw badRequest('Posts can be scheduled up to one year ahead.');
  const result = await db.$transaction(async (tx) => {
    await lockVersions(tx, postId);
    const post = await tx.socialPost.findFirst({ where: { id: postId, workspaceId: ctx.workspace.id }, include: { versions: true } });
    if (!post) throw notFound('Post');
    if (post.status !== 'SCHEDULED') throw conflict('Only scheduled posts can be moved.');
    const scheduled = post.versions.filter((v) => v.status === 'SCHEDULED');
    // Conditional update: if the worker claimed a version meanwhile, nothing moves.
    const moved = await tx.platformPost.updateMany({ where: { postId, status: 'SCHEDULED' }, data: { scheduledAt: at, nextRetryAt: null } });
    if (moved.count !== scheduled.length) throw conflict('This post started publishing and can no longer be moved.');
    await assertPostQuota(tx, ctx.workspace.id, at, scheduled.length, postId);
    await tx.socialPost.update({ where: { id: postId }, data: { scheduledAt: at, publishMode: 'SCHEDULED' } });
    return {
      removed: scheduled.map((v) => ({ id: v.id, scheduledAt: v.scheduledAt })),
      added: scheduled.map((v) => ({ id: v.id, scheduledAt: at })),
    };
  });
  await removePublishJobs(result.removed);
  await enqueuePublish(result.added);
  await audit({ action: 'post.rescheduled', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'post', targetId: postId, metadata: { scheduledAt: at.toISOString() } });
  return getPost(ctx, postId);
}

export async function cancelPost(ctx: WorkspaceCtx, postId: string, toDraft = false) {
  assertCan(ctx, 'posts.publish');
  const removed = await db.$transaction(async (tx) => {
    await lockVersions(tx, postId);
    const post = await tx.socialPost.findFirst({ where: { id: postId, workspaceId: ctx.workspace.id }, include: { versions: true } });
    if (!post) throw notFound('Post');
    const pending = post.versions.filter((v) => v.status === 'SCHEDULED' || (toDraft && (v.status === 'FAILED' || v.status === 'CANCELLED')));
    if (pending.length === 0) throw conflict('There is nothing scheduled to cancel.');
    await tx.platformPost.updateMany({
      where: { id: { in: pending.map((v) => v.id) }, status: { in: ['SCHEDULED', 'FAILED', 'CANCELLED'] } },
      data: { status: toDraft ? 'DRAFT' : 'CANCELLED', scheduledAt: toDraft ? null : undefined, nextRetryAt: null },
    });
    if (toDraft) await tx.socialPost.update({ where: { id: postId }, data: { scheduledAt: null, publishMode: null } });
    await refreshPostStatus(postId, tx);
    return pending.map((v) => ({ id: v.id, scheduledAt: v.scheduledAt }));
  });
  await removePublishJobs(removed);
  await audit({ action: toDraft ? 'post.unscheduled' : 'post.cancelled', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'post', targetId: postId });
  return getPost(ctx, postId);
}

export async function duplicatePost(ctx: WorkspaceCtx, postId: string) {
  assertCan(ctx, 'posts.edit');
  const src = await loadPost(ctx, postId);
  const activeAccounts = src.versions.filter((v) => v.socialAccount.status !== 'DISCONNECTED' && v.socialAccount.projectId === src.projectId);
  const liveMedia = await loadMediaMap(ctx.workspace.id, [...src.baseMediaIds, ...src.versions.flatMap((v) => v.media.map((m) => m.mediaAssetId))]);
  return createPost(ctx, {
    projectId: src.projectId,
    baseCaption: src.baseCaption,
    baseMediaIds: src.baseMediaIds.filter((m) => liveMedia.has(m)),
    baseLinkUrl: src.baseLinkUrl,
    notes: src.notes,
    tagIds: src.tags.map((t) => t.tagId),
    versions: activeAccounts.map((v) => ({
      socialAccountId: v.socialAccountId,
      customized: v.customized,
      caption: v.caption,
      linkUrl: v.linkUrl,
      mediaIds: v.media.map((m) => m.mediaAssetId).filter((m) => liveMedia.has(m)),
      options: normalizeOptions(v.platform, v.options),
    })),
    action: { type: 'draft' },
  });
}

export async function deletePost(ctx: WorkspaceCtx, postId: string) {
  assertCan(ctx, 'posts.edit');
  const post = await db.socialPost.findFirst({ where: { id: postId, workspaceId: ctx.workspace.id }, include: { versions: true } });
  if (!post) throw notFound('Post');
  if (post.versions.some((v) => ['PUBLISHING', 'PUBLISHED', 'NEEDS_VERIFICATION', 'SCHEDULED'].includes(v.status))) {
    throw conflict('Cancel the schedule first. Published posts are kept for your records.');
  }
  await db.socialPost.delete({ where: { id: postId } });
  await audit({ action: 'post.deleted', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'post', targetId: postId });
}

/** Manual retry of a failed channel version (publishes as soon as the worker picks it up). */
export async function retryVersion(ctx: WorkspaceCtx, platformPostId: string, opts: { force?: boolean } = {}) {
  assertCan(ctx, 'posts.publish');
  if (!ctx.user.emailVerified) throw forbidden('Verify your email address before publishing.');
  const at = new Date();
  const version = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PlatformPost" WHERE id = ${platformPostId} FOR UPDATE`;
    const v = await tx.platformPost.findFirst({ where: { id: platformPostId, workspaceId: ctx.workspace.id }, include: { socialAccount: true } });
    if (!v) throw notFound('Post version');
    if (v.status === 'NEEDS_VERIFICATION' && !opts.force) {
      throw conflict('This post may already be live. Check the channel first, then confirm the retry.', { needsConfirmation: true });
    }
    if (v.status !== 'FAILED' && v.status !== 'NEEDS_VERIFICATION') throw conflict('Only failed posts can be retried.');
    if (v.socialAccount.status !== 'CONNECTED') throw badRequest(`Reconnect ${v.socialAccount.name} before retrying.`);
    const issues = (await validatePostVersions(v.postId, tx)).find((x) => x.socialAccountId === v.socialAccountId);
    if (issues && errorsOnly(issues.issues).length) throw validationError({ versions: [issues] }, errorsOnly(issues.issues)[0]!.message);
    await assertPostQuota(tx, ctx.workspace.id, at, 1, v.postId);
    const res = await tx.platformPost.updateMany({
      where: { id: v.id, status: v.status },
      data: { status: 'SCHEDULED', scheduledAt: at, nextRetryAt: null, lastError: null, lastErrorCode: null },
    });
    if (res.count !== 1) throw conflict('This post changed in the meantime. Refresh and try again.');
    await refreshPostStatus(v.postId, tx);
    return v;
  });
  await enqueuePublish([{ id: version.id, scheduledAt: at }]);
  await audit({ action: 'post.retry', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'platform_post', targetId: platformPostId, metadata: { force: !!opts.force } });
  return getPost(ctx, version.postId);
}

/** Resolves a version whose publish outcome was unknown after a human checked the channel. */
export async function resolveVersion(ctx: WorkspaceCtx, platformPostId: string, outcome: 'published' | 'not_published', externalUrl?: string | null) {
  assertCan(ctx, 'posts.publish');
  const v = await db.platformPost.findFirst({ where: { id: platformPostId, workspaceId: ctx.workspace.id } });
  if (!v) throw notFound('Post version');
  if (v.status !== 'NEEDS_VERIFICATION') throw conflict('This post does not need verification.');
  await db.$transaction(async (tx) => {
    await tx.platformPost.update({
      where: { id: v.id },
      data:
        outcome === 'published'
          ? { status: 'PUBLISHED', publishedAt: new Date(), externalUrl: externalUrl ?? v.externalUrl, lastError: null }
          : { status: 'FAILED', lastError: 'Confirmed not published.' },
    });
    await refreshPostStatus(v.postId, tx);
  });
  await audit({ action: 'post.verified', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'platform_post', targetId: platformPostId, metadata: { outcome } });
  return getPost(ctx, v.postId);
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export const POST_TABS = ['all', 'drafts', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'] as const;
const TAB_STATUS: Record<(typeof POST_TABS)[number], PostStatus[] | null> = {
  all: null,
  drafts: ['DRAFT'],
  scheduled: ['SCHEDULED'],
  publishing: ['PUBLISHING'],
  published: ['PUBLISHED', 'PARTIALLY_PUBLISHED'],
  failed: ['FAILED', 'PARTIALLY_PUBLISHED'],
  cancelled: ['CANCELLED'],
};

const csv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').filter(Boolean).slice(0, 50) : []));

export const listPostsSchema = z.object({
  tab: z.enum(POST_TABS).default('all'),
  q: z.string().trim().max(100).optional(),
  projects: csv,
  channels: csv,
  tags: csv,
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

const listInclude = {
  project: { select: { id: true, name: true, color: true } },
  tags: { include: { tag: true } },
  createdBy: { select: { name: true, email: true } },
  versions: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      platform: true,
      status: true,
      customized: true,
      caption: true,
      lastError: true,
      externalUrl: true,
      publishedAt: true,
      socialAccount: { select: { id: true, name: true, username: true, avatarUrl: true, platform: true } },
      media: { orderBy: { position: 'asc' }, take: 1, include: { mediaAsset: true } },
    },
  },
} satisfies Prisma.SocialPostInclude;

type ListRow = Prisma.SocialPostGetPayload<{ include: typeof listInclude }>;

async function toListItems(workspaceId: string, rows: ListRow[]) {
  const firstBase = rows.map((r) => r.baseMediaIds[0]).filter((m): m is string => !!m);
  const media = await loadMediaMap(workspaceId, firstBase);
  return rows.map((r) => {
    const firstCustom = r.versions.find((v) => v.customized && v.media[0])?.media[0]?.mediaAsset;
    const thumb = r.baseMediaIds[0] ? media.get(r.baseMediaIds[0]) : firstCustom;
    const caption = r.baseCaption || r.versions.find((v) => v.customized && v.caption)?.caption || '';
    return {
      id: r.id,
      project: r.project,
      status: r.status,
      caption,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      publishMode: r.publishMode,
      updatedAt: r.updatedAt.toISOString(),
      createdBy: r.createdBy?.name ?? r.createdBy?.email ?? null,
      thumb: thumb ? mediaDto(thumb) : null,
      mediaCount: Math.max(r.baseMediaIds.length, ...r.versions.map((v) => v.media.length)),
      tags: r.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
      versions: r.versions.map((v) => ({
        id: v.id,
        platform: v.platform,
        status: v.status,
        account: v.socialAccount,
        lastError: v.lastError,
        externalUrl: v.externalUrl,
        publishedAt: v.publishedAt?.toISOString() ?? null,
      })),
    };
  });
}

export type PostListItem = Awaited<ReturnType<typeof toListItems>>[number];

export async function listPosts(ctx: WorkspaceCtx, raw: unknown) {
  assertCan(ctx, 'posts.view');
  const q = listPostsSchema.parse(raw);
  const statuses = TAB_STATUS[q.tab];
  const where: Prisma.SocialPostWhereInput = {
    workspaceId: ctx.workspace.id,
    ...(statuses ? { status: { in: statuses } } : {}),
    ...(q.q
      ? { OR: [{ baseCaption: { contains: q.q, mode: 'insensitive' } }, { versions: { some: { caption: { contains: q.q, mode: 'insensitive' } } } }] }
      : {}),
    ...(q.projects.length ? { projectId: { in: q.projects } } : {}),
    ...(q.channels.length ? { versions: { some: { socialAccountId: { in: q.channels } } } } : {}),
    ...(q.tags.length ? { tags: { some: { tagId: { in: q.tags } } } } : {}),
  };
  const orderBy: Prisma.SocialPostOrderByWithRelationInput[] =
    q.tab === 'scheduled' ? [{ scheduledAt: 'asc' }, { id: 'asc' }] : [{ updatedAt: 'desc' }, { id: 'desc' }];
  const [total, rows, counts] = await Promise.all([
    db.socialPost.count({ where }),
    db.socialPost.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: listInclude }),
    db.socialPost.groupBy({
      by: ['status'],
      where: { workspaceId: ctx.workspace.id, ...(q.projects.length ? { projectId: { in: q.projects } } : {}) },
      _count: { _all: true },
    }),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<PostStatus, number>>;
  const tabCounts = Object.fromEntries(
    POST_TABS.map((t) => [t, TAB_STATUS[t] ? TAB_STATUS[t]!.reduce((n, s) => n + (byStatus[s] ?? 0), 0) : counts.reduce((n, c) => n + c._count._all, 0)]),
  ) as Record<(typeof POST_TABS)[number], number>;
  return { items: await toListItems(ctx.workspace.id, rows), total, page: q.page, pageSize: q.pageSize, tabCounts };
}

export const calendarSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  projects: csv,
  channels: csv,
  tags: csv,
  statuses: csv,
});

/** Posts with a scheduled or publish time inside [from, to). */
export async function listCalendar(ctx: WorkspaceCtx, raw: unknown) {
  assertCan(ctx, 'posts.view');
  const q = calendarSchema.parse(raw);
  const from = new Date(q.from);
  const to = new Date(q.to);
  if (to.getTime() - from.getTime() > 62 * 24 * 3600 * 1000) throw badRequest('Calendar range is too large.');
  const statuses = q.statuses.filter((s): s is PostStatus =>
    ['DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'PARTIALLY_PUBLISHED', 'FAILED', 'CANCELLED'].includes(s),
  );
  const rows = await db.socialPost.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      scheduledAt: { gte: from, lt: to },
      status: statuses.length ? { in: statuses } : { not: 'DRAFT' },
      ...(q.projects.length ? { projectId: { in: q.projects } } : {}),
      ...(q.channels.length ? { versions: { some: { socialAccountId: { in: q.channels } } } } : {}),
      ...(q.tags.length ? { tags: { some: { tagId: { in: q.tags } } } } : {}),
    },
    orderBy: { scheduledAt: 'asc' },
    take: 500,
    include: listInclude,
  });
  return { items: await toListItems(ctx.workspace.id, rows) };
}
