import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db, type Tx } from '../db';
import { badRequest, conflict, notFound } from '../errors';
import { audit } from '../audit';
import { assertCan, type WorkspaceCtx } from '../auth/ctx';
import { assertWithinLimit, getWorkspacePlan, limitOf } from './entitlements';
import { availablePlatforms, channelDto, integrationMode } from './channels';
import { PLATFORMS, type Platform } from '@/lib/platforms';

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a project name').max(60, 'Use at most 60 characters'),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Choose a colour').optional(),
});

/**
 * Serialises project creation per workspace so two concurrent requests can't both pass the
 * plan limit check.
 */
async function lockWorkspace(tx: Tx, workspaceId: string) {
  await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
}

/** Row-locks a project so its Instagram/Facebook slots can be filled one at a time. */
export async function lockProject(tx: Tx, workspaceId: string, projectId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Project" WHERE id = ${projectId} AND "workspaceId" = ${workspaceId} FOR UPDATE`;
  if (rows.length === 0) throw notFound('Project');
}

export async function findProject(ctx: WorkspaceCtx, projectId: string, tx: Tx = db) {
  const p = await tx.project.findFirst({ where: { id: projectId, workspaceId: ctx.workspace.id } });
  if (!p) throw notFound('Project');
  return p;
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** The workspace's projects with one slot per platform. */
export async function listProjects(ctx: WorkspaceCtx) {
  assertCan(ctx, 'channels.view');
  const [projects, accounts, postCounts, plan] = await Promise.all([
    db.project.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    db.socialAccount.findMany({
      where: { workspaceId: ctx.workspace.id, status: { not: 'DISCONNECTED' } },
      orderBy: { createdAt: 'asc' },
      include: { connectedBy: { select: { name: true, email: true } }, _count: { select: { platformPosts: { where: { status: 'SCHEDULED' } } } } },
    }),
    db.socialPost.groupBy({ by: ['projectId'], where: { workspaceId: ctx.workspace.id }, _count: { _all: true } }),
    getWorkspacePlan(ctx.workspace.id),
  ]);
  const posts = new Map(postCounts.map((p) => [p.projectId, p._count._all]));
  return {
    mode: integrationMode(),
    available: availablePlatforms(),
    planName: plan.planName,
    limit: limitOf(plan, 'projects'),
    used: projects.length,
    projects: projects.map((p) => {
      const mine = accounts.filter((a) => a.projectId === p.id);
      const slot = (platform: Platform) => {
        const a = mine.find((x) => x.platform === platform);
        return a ? channelDto(a) : null;
      };
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        createdAt: p.createdAt.toISOString(),
        postCount: posts.get(p.id) ?? 0,
        /** One slot per platform: the linked account, or null. */
        slots: Object.fromEntries(PLATFORMS.map((pl) => [pl, slot(pl)])) as Record<Platform, ReturnType<typeof slot>>,
      };
    }),
  };
}

export type ProjectList = Awaited<ReturnType<typeof listProjects>>;

export async function createProject(ctx: WorkspaceCtx, raw: z.input<typeof projectInputSchema>) {
  assertCan(ctx, 'channels.manage');
  const input = projectInputSchema.parse(raw);
  try {
    const project = await db.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx.workspace.id);
      const [count, plan] = await Promise.all([tx.project.count({ where: { workspaceId: ctx.workspace.id } }), getWorkspacePlan(ctx.workspace.id, tx)]);
      assertWithinLimit(plan, 'projects', count);
      return tx.project.create({
        data: { workspaceId: ctx.workspace.id, name: input.name, color: input.color ?? COLORS[count % COLORS.length]! },
      });
    });
    await audit({ action: 'project.created', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'project', targetId: project.id, metadata: { name: project.name } });
    return { id: project.id, name: project.name, color: project.color };
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('A project with this name already exists.');
    throw err;
  }
}

export async function updateProject(ctx: WorkspaceCtx, projectId: string, raw: z.input<typeof projectInputSchema>) {
  assertCan(ctx, 'channels.manage');
  const input = projectInputSchema.parse(raw);
  await findProject(ctx, projectId);
  try {
    const p = await db.project.update({ where: { id: projectId }, data: { name: input.name, ...(input.color ? { color: input.color } : {}) } });
    await audit({ action: 'project.updated', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'project', targetId: p.id, metadata: { name: p.name } });
    return { id: p.id, name: p.name, color: p.color };
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('A project with this name already exists.');
    throw err;
  }
}

/**
 * Deletes a project and its posts. Channels must be disconnected first (which also cancels
 * their scheduled posts), and the last project can't be deleted.
 */
export async function deleteProject(ctx: WorkspaceCtx, projectId: string) {
  assertCan(ctx, 'channels.manage');
  const project = await findProject(ctx, projectId);
  await db.$transaction(async (tx) => {
    await lockWorkspace(tx, ctx.workspace.id);
    const total = await tx.project.count({ where: { workspaceId: ctx.workspace.id } });
    if (total <= 1) throw badRequest('A workspace needs at least one project.');
    const active = await tx.socialAccount.count({ where: { projectId, status: { not: 'DISCONNECTED' } } });
    if (active > 0) throw conflict('Disconnect this project’s channels before deleting it.');
    const busy = await tx.platformPost.count({ where: { post: { projectId }, status: { in: ['SCHEDULED', 'PUBLISHING'] } } });
    if (busy > 0) throw conflict('This project still has posts scheduled or publishing.');
    await tx.project.delete({ where: { id: projectId } });
  });
  await audit({ action: 'project.deleted', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'project', targetId: projectId, metadata: { name: project.name } });
}
