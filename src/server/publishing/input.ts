import { db } from '../db';
import { decrypt } from '../crypto';
import type { PublishInput, PublishMedia } from '../adapters/types';
import { signedMediaUrl } from '../services/media';
import { effectiveContent } from '../services/posts';

/** Everything an adapter needs to publish (or verify) one channel version. */
export async function buildPublishInput(versionId: string): Promise<{ input: PublishInput; accountStatus: string; mode: 'MOCK' | 'DEVELOPMENT' | 'LIVE' }> {
  const v = await db.platformPost.findUniqueOrThrow({
    where: { id: versionId },
    include: { post: true, socialAccount: true, media: { orderBy: { position: 'asc' }, include: { mediaAsset: true } } },
  });
  const content = effectiveContent(v.post, { customized: v.customized, caption: v.caption, linkUrl: v.linkUrl, mediaIds: v.media.map((m) => m.mediaAssetId) });
  const assets = await db.mediaAsset.findMany({ where: { id: { in: content.mediaIds }, workspaceId: v.workspaceId } });
  const media: PublishMedia[] = content.mediaIds
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map((a) => ({
      id: a.id,
      kind: a.kind,
      mimeType: a.mimeType,
      // Instagram only accepts JPEG images; other formats are converted on the fly.
      url: signedMediaUrl(a.id, { format: v.platform === 'INSTAGRAM' && a.kind === 'IMAGE' && a.mimeType !== 'image/jpeg' ? 'jpeg' : 'original', ttlSec: 3 * 3600 }),
      durationSec: a.durationSec,
    }));
  return {
    accountStatus: v.socialAccount.status,
    mode: v.socialAccount.mode,
    input: {
      account: {
        id: v.socialAccount.id,
        externalId: v.socialAccount.externalId,
        accessToken: decrypt(v.socialAccount.accessTokenEnc),
        metadata: (v.socialAccount.metadata ?? {}) as Record<string, unknown>,
        scopes: v.socialAccount.scopes,
      },
      format: v.format,
      caption: content.caption,
      linkUrl: content.linkUrl,
      media,
      idempotencyKey: v.idempotencyKey,
      providerState: (v.providerState ?? null) as Record<string, unknown> | null,
    },
  };
}

