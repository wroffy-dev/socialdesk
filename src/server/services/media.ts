import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, rm } from 'node:fs/promises';
import { createId } from '../ids';
import sharp from 'sharp';
import { z } from 'zod';
import type { MediaAsset, Prisma } from '@prisma/client';
import { db } from '../db';
import { env } from '../env';
import { badRequest, conflict, notFound } from '../errors';
import { audit } from '../audit';
import { hmac, safeEqual } from '../crypto';
import { storage } from '../storage';
import { assertCan, type WorkspaceCtx } from '../auth/ctx';
import { ALLOWED_IMAGE, ALLOWED_VIDEO, EXT, sniffMime } from '../media/sniff';
import { probeMp4 } from '../media/mp4';

const MB = 1024 * 1024;

export function uploadLimits() {
  return { imageBytes: env().MAX_IMAGE_MB * MB, videoBytes: env().MAX_VIDEO_MB * MB };
}

async function sha256File(filePath: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function readHead(filePath: string, bytes = 32) {
  const fh = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

const cleanName = (name: string) =>
  name
    .replace(/[\\/]/g, '_')
    .replace(/[^\p{L}\p{N} ._()-]/gu, '')
    .trim()
    .slice(0, 120) || 'upload';

/**
 * Validates an uploaded temp file and stores it. The file's real type comes from its bytes;
 * images are decoded with sharp (which rejects corrupt or disguised files).
 */
export async function ingestUpload(ctx: WorkspaceCtx, file: { tempPath: string; originalName: string; sizeBytes: number }) {
  assertCan(ctx, 'media.upload');
  try {
    const mime = sniffMime(await readHead(file.tempPath));
    if (!mime || (!ALLOWED_IMAGE.has(mime) && !ALLOWED_VIDEO.has(mime))) {
      throw badRequest('Unsupported file type. Upload JPEG, PNG, WebP or GIF images, or MP4/MOV videos.');
    }
    const kind = ALLOWED_IMAGE.has(mime) ? 'IMAGE' : 'VIDEO';
    const limits = uploadLimits();
    const max = kind === 'IMAGE' ? limits.imageBytes : limits.videoBytes;
    if (file.sizeBytes > max) throw badRequest(`${kind === 'IMAGE' ? 'Images' : 'Videos'} must be ${Math.round(max / MB)} MB or smaller.`);
    if (file.sizeBytes === 0) throw badRequest('The file is empty.');

    let width: number | null = null;
    let height: number | null = null;
    let durationSec: number | null = null;
    let thumb: Buffer | null = null;
    if (kind === 'IMAGE') {
      try {
        const img = sharp(file.tempPath, { failOn: 'error', limitInputPixels: 100_000_000 });
        const meta = await img.metadata();
        // EXIF orientations 5–8 swap width and height.
        const rotated = (meta.orientation ?? 1) >= 5;
        width = (rotated ? meta.height : meta.width) ?? null;
        height = (rotated ? meta.width : meta.height) ?? null;
        thumb = await sharp(file.tempPath).rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
      } catch {
        throw badRequest('This image could not be read. It may be corrupt.');
      }
    } else {
      const probe = await probeMp4(file.tempPath);
      if (probe.durationSec === null) throw badRequest('This video could not be read. Upload a standard MP4 or MOV file.');
      ({ width, height, durationSec } = probe);
    }

    const id = createId();
    const now = new Date();
    const key = `ws/${ctx.workspace.id}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${EXT[mime]}`;
    const checksum = await sha256File(file.tempPath);
    await storage().putFile(key, file.tempPath);
    if (thumb) await storage().putBuffer(`${key}.thumb.webp`, thumb);

    const asset = await db.mediaAsset.create({
      data: {
        id,
        workspaceId: ctx.workspace.id,
        uploadedById: ctx.user.id,
        kind,
        originalName: cleanName(file.originalName),
        mimeType: mime,
        sizeBytes: file.sizeBytes,
        width,
        height,
        durationSec,
        storageKey: key,
        checksum,
      },
    });
    await audit({ action: 'media.uploaded', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'media', targetId: asset.id });
    return toDto(asset);
  } finally {
    await rm(file.tempPath, { force: true });
  }
}

export const listMediaSchema = z.object({
  q: z.string().trim().max(100).optional(),
  kind: z.enum(['IMAGE', 'VIDEO']).optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(40),
});

export async function listMedia(ctx: WorkspaceCtx, input: z.input<typeof listMediaSchema>) {
  assertCan(ctx, 'media.view');
  const q = listMediaSchema.parse(input);
  const where: Prisma.MediaAssetWhereInput = {
    workspaceId: ctx.workspace.id,
    deletedAt: null,
    ...(q.kind ? { kind: q.kind } : {}),
    ...(q.q ? { originalName: { contains: q.q, mode: 'insensitive' } } : {}),
  };
  const rows = await db.mediaAsset.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    include: { uploadedBy: { select: { name: true, email: true } }, _count: { select: { usages: true } } },
  });
  const page = rows.slice(0, q.take);
  return {
    items: page.map((r) => ({ ...toDto(r), uploadedBy: r.uploadedBy?.name ?? r.uploadedBy?.email ?? null, usageCount: r._count.usages })),
    nextCursor: rows.length > q.take ? page[page.length - 1]!.id : null,
  };
}

export async function getMediaAsset(ctx: WorkspaceCtx, id: string) {
  assertCan(ctx, 'media.view');
  const asset = await db.mediaAsset.findFirst({ where: { id, workspaceId: ctx.workspace.id, deletedAt: null } });
  if (!asset) throw notFound('Media');
  return asset;
}

/** Media still needed by a post that has not been published yet cannot be deleted. */
export async function deleteMedia(ctx: WorkspaceCtx, id: string) {
  assertCan(ctx, 'media.delete');
  const asset = await getMediaAsset(ctx, id);
  const [activeVersions, activeBase] = await Promise.all([
    db.platformPostMedia.count({
      where: { mediaAssetId: id, platformPost: { status: { in: ['DRAFT', 'SCHEDULED', 'PUBLISHING', 'FAILED', 'NEEDS_VERIFICATION'] } } },
    }),
    db.socialPost.count({ where: { workspaceId: ctx.workspace.id, baseMediaIds: { has: id }, status: { in: ['DRAFT', 'SCHEDULED', 'FAILED'] } } }),
  ]);
  if (activeVersions + activeBase > 0) {
    throw conflict('This file is used by a draft or scheduled post. Remove it from those posts first.', { usedBy: activeVersions + activeBase });
  }
  await db.mediaAsset.update({ where: { id }, data: { deletedAt: new Date() } });
  await storage().delete(asset.storageKey);
  await storage().delete(`${asset.storageKey}.thumb.webp`);
  await audit({ action: 'media.deleted', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'media', targetId: id });
}

export async function updateMediaAlt(ctx: WorkspaceCtx, id: string, altText: string | null) {
  assertCan(ctx, 'media.upload');
  await getMediaAsset(ctx, id);
  const asset = await db.mediaAsset.update({ where: { id }, data: { altText: altText?.slice(0, 500) ?? null } });
  return toDto(asset);
}

export function toDto(a: MediaAsset) {
  const base = `/api/w/${a.workspaceId}/media/${a.id}/file`;
  return {
    id: a.id,
    kind: a.kind,
    originalName: a.originalName,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    width: a.width,
    height: a.height,
    durationSec: a.durationSec,
    altText: a.altText,
    createdAt: a.createdAt.toISOString(),
    url: base,
    thumbUrl: a.kind === 'IMAGE' ? `${base}?variant=thumb` : null,
  };
}

export type MediaDto = ReturnType<typeof toDto>;

// ---------------------------------------------------------------------------
// Signed public URLs (for platforms that fetch media from us when publishing)
// ---------------------------------------------------------------------------

export type MediaFormat = 'original' | 'jpeg';

function signature(id: string, exp: number, format: MediaFormat) {
  return hmac(env().MEDIA_SIGNING_SECRET, `${id}.${exp}.${format}`);
}

/** Short-lived URL a platform can fetch without a session. */
export function signedMediaUrl(id: string, opts: { format?: MediaFormat; ttlSec?: number } = {}) {
  const format = opts.format ?? 'original';
  const exp = Math.floor(Date.now() / 1000) + (opts.ttlSec ?? 2 * 60 * 60);
  const sig = signature(id, exp, format);
  return `${env().APP_URL}/api/media/public/${id}?exp=${exp}&f=${format}&sig=${sig}`;
}

export function verifyMediaSignature(id: string, exp: string | null, format: string | null, sig: string | null): MediaFormat | null {
  if (!exp || !sig || (format !== 'original' && format !== 'jpeg')) return null;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now() / 1000) return null;
  return safeEqual(signature(id, expNum, format), sig) ? format : null;
}

/** JPEG rendition for Instagram, which only accepts JPEG images. Cached next to the original. */
export async function ensureJpeg(asset: Pick<MediaAsset, 'storageKey' | 'mimeType'>) {
  if (asset.mimeType === 'image/jpeg') return { key: asset.storageKey, mime: 'image/jpeg' };
  const key = `${asset.storageKey}.publish.jpg`;
  if ((await storage().size(key)) === null) {
    const chunks: Buffer[] = [];
    for await (const c of storage().read(asset.storageKey)) chunks.push(c as Buffer);
    const jpeg = await sharp(Buffer.concat(chunks)).rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
    await storage().putBuffer(key, jpeg);
  }
  return { key, mime: 'image/jpeg' };
}
