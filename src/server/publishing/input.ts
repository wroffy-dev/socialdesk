import { db } from '../db';
import { accountRef } from '../integrations/tokens';
import type { PublishInput, PublishMedia } from '../adapters/types';
import { ensureJpeg, signedMediaUrl } from '../services/media';
import { storage } from '../storage';
import { effectiveContent } from '../services/posts';
import { normalizeOptions } from '@/lib/post-options';

/** Everything an adapter needs to publish (or verify) one channel version. */
export async function buildPublishInput(versionId: string): Promise<{ input: PublishInput; accountStatus: string; mode: 'MOCK' | 'DEVELOPMENT' | 'LIVE' }> {
  const v = await db.platformPost.findUniqueOrThrow({
    where: { id: versionId },
    include: { post: true, socialAccount: true, media: { orderBy: { position: 'asc' }, include: { mediaAsset: true } } },
  });
  const content = effectiveContent(v.post, { customized: v.customized, caption: v.caption, linkUrl: v.linkUrl, mediaIds: v.media.map((m) => m.mediaAssetId) });
  const assets = await db.mediaAsset.findMany({ where: { id: { in: content.mediaIds }, workspaceId: v.workspaceId } });
  const ordered = content.mediaIds.map((id) => assets.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a);
  const media: PublishMedia[] = [];
  for (const a of ordered) {
    // Instagram only accepts JPEG images and LinkedIn doesn't take WebP; those are converted.
    const convert =
      a.kind === 'IMAGE' && ((v.platform === 'INSTAGRAM' && a.mimeType !== 'image/jpeg') || (v.platform === 'LINKEDIN' && a.mimeType === 'image/webp'));
    const file = convert ? await ensureJpeg(a) : { key: a.storageKey, mime: a.mimeType };
    const size = convert ? ((await storage().size(file.key)) ?? 0) : a.sizeBytes;
    media.push({
      id: a.id,
      kind: a.kind,
      mimeType: file.mime,
      url: signedMediaUrl(a.id, { format: convert ? 'jpeg' : 'original', ttlSec: 3 * 3600 }),
      durationSec: a.durationSec,
      width: a.width,
      height: a.height,
      sizeBytes: size,
      read: (start, end) => readRange(file.key, start, end),
    });
  }
  return {
    accountStatus: v.socialAccount.status,
    mode: v.socialAccount.mode,
    input: {
      account: await accountRef(v.socialAccount),
      format: v.format,
      caption: content.caption,
      linkUrl: content.linkUrl,
      media,
      idempotencyKey: v.idempotencyKey,
      providerState: (v.providerState ?? null) as Record<string, unknown> | null,
      options: normalizeOptions(v.platform, v.options),
    },
  };
}


/** Reads bytes [start, end) of a stored file into memory (upload chunks are a few MB). */
async function readRange(key: string, start: number, end: number): Promise<Buffer> {
  if (end <= start) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const c of storage().read(key, { start, end: end - 1 })) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}
