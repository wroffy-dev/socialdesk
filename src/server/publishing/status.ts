import type { PlatformPostStatus, PostStatus } from '@prisma/client';
import { db, type Tx } from '../db';

/** Campaign status summarised from its channel versions. */
export function deriveStatus(versions: PlatformPostStatus[], current: PostStatus): PostStatus {
  if (versions.length === 0) return current === 'CANCELLED' ? 'CANCELLED' : 'DRAFT';
  const has = (s: PlatformPostStatus) => versions.includes(s);
  const all = (s: PlatformPostStatus) => versions.every((v) => v === s);
  if (all('DRAFT')) return 'DRAFT';
  if (all('CANCELLED')) return 'CANCELLED';
  if (has('PUBLISHING')) return 'PUBLISHING';
  if (has('SCHEDULED')) return 'SCHEDULED';
  const published = versions.filter((v) => v === 'PUBLISHED').length;
  const failed = versions.filter((v) => v === 'FAILED' || v === 'NEEDS_VERIFICATION').length;
  if (published > 0 && failed === 0) return 'PUBLISHED';
  if (published > 0 && failed > 0) return 'PARTIALLY_PUBLISHED';
  if (failed > 0) return 'FAILED';
  if (has('DRAFT')) return 'DRAFT';
  return current;
}

export async function refreshPostStatus(postId: string, tx: Tx = db) {
  const post = await tx.socialPost.findUnique({ where: { id: postId }, select: { status: true, versions: { select: { status: true } } } });
  if (!post) return null;
  const next = deriveStatus(
    post.versions.map((v) => v.status),
    post.status,
  );
  if (next !== post.status) await tx.socialPost.update({ where: { id: postId }, data: { status: next } });
  return next;
}
