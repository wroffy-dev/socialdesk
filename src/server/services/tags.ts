import { z } from 'zod';
import { db } from '../db';
import { notFound } from '../errors';
import { assertCan, type WorkspaceCtx } from '../auth/ctx';

export const tagSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour').default('#9ca3af'),
});

export async function listTags(ctx: WorkspaceCtx) {
  assertCan(ctx, 'posts.view');
  const tags = await db.contentTag.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { name: 'asc' },
    include: { _count: { select: { posts: true } } },
  });
  return tags.map((t) => ({ id: t.id, name: t.name, color: t.color, postCount: t._count.posts }));
}

export async function createTag(ctx: WorkspaceCtx, input: z.input<typeof tagSchema>) {
  assertCan(ctx, 'tags.manage');
  const data = tagSchema.parse(input);
  return db.contentTag.create({ data: { ...data, workspaceId: ctx.workspace.id }, select: { id: true, name: true, color: true } });
}

export async function updateTag(ctx: WorkspaceCtx, id: string, input: z.input<typeof tagSchema>) {
  assertCan(ctx, 'tags.manage');
  const data = tagSchema.parse(input);
  const res = await db.contentTag.updateMany({ where: { id, workspaceId: ctx.workspace.id }, data });
  if (res.count === 0) throw notFound('Tag');
  return { id, ...data };
}

export async function deleteTag(ctx: WorkspaceCtx, id: string) {
  assertCan(ctx, 'tags.manage');
  const res = await db.contentTag.deleteMany({ where: { id, workspaceId: ctx.workspace.id } });
  if (res.count === 0) throw notFound('Tag');
}
