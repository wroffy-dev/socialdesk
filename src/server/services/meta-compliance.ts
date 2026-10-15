import { randomBytes } from 'node:crypto';
import { db } from '../db';
import { encrypt } from '../crypto';
import { audit } from '../audit';
import { refreshPostStatus } from '../publishing/status';

/**
 * Removes stored tokens for every channel connected by a Facebook user (deauthorisation or
 * data-deletion request from Meta). Scheduled posts for those channels are cancelled.
 */
export async function revokeMetaUser(fbUserId: string, reason: 'deauthorize' | 'data_deletion') {
  const accounts = await db.socialAccount.findMany({ where: { metadata: { path: ['fbUserId'], equals: fbUserId }, status: { not: 'DISCONNECTED' } } });
  for (const acc of accounts) {
    await db.$transaction(async (tx) => {
      const versions = await tx.platformPost.findMany({ where: { socialAccountId: acc.id, status: 'SCHEDULED' }, select: { id: true, postId: true } });
      await tx.platformPost.updateMany({ where: { id: { in: versions.map((v) => v.id) } }, data: { status: 'CANCELLED', lastError: 'Access was removed in Facebook.' } });
      await tx.socialAccount.update({
        where: { id: acc.id },
        data: {
          status: reason === 'data_deletion' ? 'DISCONNECTED' : 'NEEDS_REAUTH',
          accessTokenEnc: encrypt('revoked'),
          lastError: 'Access was removed in Facebook.',
          ...(reason === 'data_deletion' ? { avatarUrl: null, metadata: { revoked: true } } : {}),
        },
      });
      for (const postId of new Set(versions.map((v) => v.postId))) await refreshPostStatus(postId, tx);
    });
    await audit({ action: `channel.meta_${reason}`, workspaceId: acc.workspaceId, targetType: 'social_account', targetId: acc.id });
  }
  return { accounts: accounts.length, confirmationCode: randomBytes(8).toString('hex') };
}
