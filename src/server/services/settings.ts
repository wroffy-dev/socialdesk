import { z } from 'zod';
import sharp from 'sharp';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { badRequest, notFound } from '../errors';
import { audit } from '../audit';
import { assertCan, type WorkspaceCtx } from '../auth/ctx';
import { storage } from '../storage';

// ---- Notification preferences (per user, per workspace) -------------------

export const notificationPrefsSchema = z.object({
  emailOnFailure: z.boolean(),
  emailOnPublish: z.boolean(),
  emailWeeklyDigest: z.boolean(),
});

export async function getNotificationPrefs(ctx: WorkspaceCtx) {
  const row = await db.notificationPreference.upsert({
    where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: ctx.user.id } },
    create: { workspaceId: ctx.workspace.id, userId: ctx.user.id },
    update: {},
  });
  return { emailOnFailure: row.emailOnFailure, emailOnPublish: row.emailOnPublish, emailWeeklyDigest: row.emailWeeklyDigest };
}

export async function updateNotificationPrefs(ctx: WorkspaceCtx, input: z.infer<typeof notificationPrefsSchema>) {
  const data = notificationPrefsSchema.parse(input);
  await db.notificationPreference.upsert({
    where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: ctx.user.id } },
    create: { workspaceId: ctx.workspace.id, userId: ctx.user.id, ...data },
    update: data,
  });
  return data;
}

// ---- Saved replies ----------------------------------------------------------

export const savedReplySchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(80),
  body: z.string().trim().min(1, 'Enter the reply text').max(2000),
});

export async function listSavedReplies(ctx: WorkspaceCtx) {
  assertCan(ctx, 'community.view');
  return db.savedReply.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { title: 'asc' }, select: { id: true, title: true, body: true, updatedAt: true } });
}

export async function createSavedReply(ctx: WorkspaceCtx, input: z.infer<typeof savedReplySchema>) {
  assertCan(ctx, 'savedReplies.manage');
  const data = savedReplySchema.parse(input);
  return db.savedReply.create({ data: { ...data, workspaceId: ctx.workspace.id }, select: { id: true, title: true, body: true, updatedAt: true } });
}

export async function updateSavedReply(ctx: WorkspaceCtx, id: string, input: z.infer<typeof savedReplySchema>) {
  assertCan(ctx, 'savedReplies.manage');
  const data = savedReplySchema.parse(input);
  const res = await db.savedReply.updateMany({ where: { id, workspaceId: ctx.workspace.id }, data });
  if (!res.count) throw notFound('Saved reply');
  return { id, ...data };
}

export async function deleteSavedReply(ctx: WorkspaceCtx, id: string) {
  assertCan(ctx, 'savedReplies.manage');
  const res = await db.savedReply.deleteMany({ where: { id, workspaceId: ctx.workspace.id } });
  if (!res.count) throw notFound('Saved reply');
}

// ---- Audit log ----------------------------------------------------------------

export const auditQuerySchema = z.object({
  cursor: z.string().optional(),
  action: z.string().max(60).optional(),
});

export async function listAuditLog(ctx: WorkspaceCtx, raw: unknown) {
  assertCan(ctx, 'audit.view');
  const q = auditQuerySchema.parse(raw);
  const where: Prisma.AuditLogWhereInput = { workspaceId: ctx.workspace.id, ...(q.action ? { action: { startsWith: q.action } } : {}) };
  const rows = await db.auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 51,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    include: { actor: { select: { name: true, email: true } } },
  });
  const page = rows.slice(0, 50);
  return {
    items: page.map((r) => ({
      id: r.id,
      action: r.action,
      actor: r.actor ? (r.actor.name ?? r.actor.email) : 'System',
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: rows.length > 50 ? page[page.length - 1]!.id : null,
  };
}

// ---- Workspace logo ---------------------------------------------------------------

export const logoKey = (workspaceId: string) => `ws/${workspaceId}/logo.webp`;

/** Resizes the uploaded image to a 256px WebP square; never stores the original bytes. */
export async function setWorkspaceLogo(ctx: WorkspaceCtx, file: Buffer) {
  assertCan(ctx, 'workspace.update');
  let out: Buffer;
  try {
    out = await sharp(file, { failOn: 'error', limitInputPixels: 50_000_000 }).rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw badRequest('Upload a PNG, JPEG or WebP image.');
  }
  await storage().putBuffer(logoKey(ctx.workspace.id), out);
  const logoUrl = `/api/w/${ctx.workspace.id}/logo?v=${Date.now()}`;
  await db.workspace.update({ where: { id: ctx.workspace.id }, data: { logoUrl } });
  await audit({ action: 'workspace.logo_updated', actorId: ctx.user.id, workspaceId: ctx.workspace.id });
  return { logoUrl };
}

export async function removeWorkspaceLogo(ctx: WorkspaceCtx) {
  assertCan(ctx, 'workspace.update');
  await storage().delete(logoKey(ctx.workspace.id));
  await db.workspace.update({ where: { id: ctx.workspace.id }, data: { logoUrl: null } });
}
