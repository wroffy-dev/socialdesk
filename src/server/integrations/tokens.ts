import type { SocialAccount } from '@prisma/client';
import { PLATFORM_PROVIDER } from '@/lib/platforms';
import { db } from '../db';
import { decrypt, encrypt } from '../crypto';
import { AdapterError, type AccountRef } from '../adapters/types';
import { PROVIDERS } from './providers';

/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_MS = 5 * 60_000;

type TokenFields = Pick<SocialAccount, 'id' | 'platform' | 'mode' | 'externalId' | 'accessTokenEnc' | 'refreshTokenEnc' | 'tokenExpiresAt' | 'metadata' | 'scopes'>;

/** Account reference with the stored token, without refreshing it. */
export function toAccountRef(a: Pick<SocialAccount, 'id' | 'externalId' | 'accessTokenEnc' | 'metadata' | 'scopes'>): AccountRef {
  return {
    id: a.id,
    externalId: a.externalId,
    accessToken: decrypt(a.accessTokenEnc),
    metadata: (a.metadata ?? {}) as Record<string, unknown>,
    scopes: a.scopes,
  };
}

const needsRefresh = (a: Pick<SocialAccount, 'mode' | 'refreshTokenEnc' | 'tokenExpiresAt'>) =>
  a.mode !== 'MOCK' && !!a.refreshTokenEnc && !!a.tokenExpiresAt && a.tokenExpiresAt.getTime() < Date.now() + REFRESH_MARGIN_MS;

/**
 * Account reference with a usable access token. X, Google and LinkedIn tokens are short-lived:
 * an expiring token is refreshed under a row lock, so concurrent jobs refresh it once (X rotates
 * refresh tokens, so a second refresh with the old one would fail).
 */
export async function accountRef(acc: TokenFields): Promise<AccountRef> {
  if (!needsRefresh(acc)) return toAccountRef(acc);
  const provider = PROVIDERS[PLATFORM_PROVIDER[acc.platform]];
  if (!provider.refresh) return toAccountRef(acc);
  const result = await db.$transaction(
    async (tx): Promise<AccountRef | { revoked: AdapterError }> => {
      await tx.$queryRaw`SELECT id FROM "SocialAccount" WHERE id = ${acc.id} FOR UPDATE`;
      const fresh = await tx.socialAccount.findUniqueOrThrow({ where: { id: acc.id } });
      if (!needsRefresh(fresh)) return toAccountRef(fresh);
      let t;
      try {
        t = await provider.refresh!(decrypt(fresh.refreshTokenEnc!));
      } catch (err) {
        if (err instanceof AdapterError && err.kind === 'auth') return { revoked: err };
        throw err;
      }
      const updated = await tx.socialAccount.update({
        where: { id: fresh.id },
        data: {
          accessTokenEnc: encrypt(t.accessToken),
          tokenExpiresAt: t.expiresAt ? new Date(t.expiresAt) : null,
          ...(t.refreshToken ? { refreshTokenEnc: encrypt(t.refreshToken) } : {}),
          ...(t.refreshTokenExpiresAt ? { refreshTokenExpiresAt: new Date(t.refreshTokenExpiresAt) } : {}),
        },
      });
      return toAccountRef(updated);
    },
    { timeout: 30_000 },
  );
  if ('revoked' in result) {
    // Recorded outside the transaction so it isn't rolled back with the failed refresh.
    const message = 'The connection expired or was revoked. Reconnect this channel.';
    await db.socialAccount.update({ where: { id: acc.id }, data: { status: 'NEEDS_REAUTH', lastError: message } });
    throw new AdapterError('auth', message, result.revoked.code);
  }
  return result;
}
