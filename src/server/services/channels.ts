import { z } from 'zod';
import type { Prisma, SocialAccount } from '@prisma/client';
import { db } from '../db';
import { env } from '../env';
import { badRequest, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { decrypt, decryptJson, encrypt, encryptJson, hashToken, randomToken, safeEqual } from '../crypto';
import { assertCan, loadCtx, type WorkspaceCtx } from '../auth/ctx';
import { adapterFor } from '../adapters/registry';
import type { AccountRef } from '../adapters/types';
import { discoverMetaAccounts, metaAuthUrl, mockDiscovery, type DiscoveredAccount } from '../integrations/meta-oauth';
import { removePublishJobs } from '../queue/producer';
import { refreshPostStatus } from '../publishing/status';
import { assertWithinLimit, getWorkspacePlan, limitOf } from './entitlements';

const STATE_TTL_MS = 10 * 60 * 1000;
const PENDING_TTL_MS = 30 * 60 * 1000;

export function integrationMode(): 'MOCK' | 'DEVELOPMENT' | 'LIVE' {
  const m = env().META_MODE;
  return m === 'mock' ? 'MOCK' : m === 'live' ? 'LIVE' : 'DEVELOPMENT';
}

export function toAccountRef(a: Pick<SocialAccount, 'id' | 'externalId' | 'accessTokenEnc' | 'metadata' | 'scopes'>): AccountRef {
  return {
    id: a.id,
    externalId: a.externalId,
    accessToken: decrypt(a.accessTokenEnc),
    metadata: (a.metadata ?? {}) as Record<string, unknown>,
    scopes: a.scopes,
  };
}

// ---------------------------------------------------------------------------
// OAuth start / callback
// ---------------------------------------------------------------------------

/**
 * Starts a Meta connection. The random state is stored hashed and bound to this user and
 * workspace; the raw value is also set in an httpOnly cookie so the callback must happen in
 * the same browser.
 */
export async function startMetaConnect(ctx: WorkspaceCtx) {
  assertCan(ctx, 'channels.manage');
  if (!ctx.user.emailVerified) throw forbidden('Verify your email address before connecting channels.');
  const state = randomToken(24);
  await db.oAuthState.create({
    data: { stateHash: hashToken(state), workspaceId: ctx.workspace.id, userId: ctx.user.id, provider: 'meta', expiresAt: new Date(Date.now() + STATE_TTL_MS) },
  });
  const redirectUrl = integrationMode() === 'MOCK' ? `${env().APP_URL}/api/oauth/meta/callback?code=mock&state=${state}` : metaAuthUrl(state);
  return { state, redirectUrl };
}

export type CallbackResult = { ok: true; slug: string; pendingId: string } | { ok: false; slug: string | null; message: string };

export async function handleMetaCallback(
  user: { id: string; email: string; name: string | null; emailVerified: Date | null },
  params: { code?: string | null; state?: string | null; error?: string | null; errorDescription?: string | null },
  cookieState: string | undefined,
): Promise<CallbackResult> {
  if (!params.state) return { ok: false, slug: null, message: 'The connection request is missing its security token. Please try again.' };
  const row = await db.oAuthState.findUnique({ where: { stateHash: hashToken(params.state) }, include: { workspace: { select: { slug: true } } } });
  if (!row || row.provider !== 'meta') return { ok: false, slug: null, message: 'This connection link is invalid. Please try again.' };
  const slug = row.workspace.slug;
  if (row.usedAt) return { ok: false, slug, message: 'This connection link was already used. Please start again.' };
  if (row.expiresAt < new Date()) return { ok: false, slug, message: 'The connection took too long and expired. Please try again.' };
  if (row.userId !== user.id) return { ok: false, slug, message: 'This connection was started by a different user.' };
  if (!cookieState || !safeEqual(cookieState, params.state)) {
    return { ok: false, slug, message: 'The connection must be completed in the same browser it was started from.' };
  }
  const claimed = await db.oAuthState.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) return { ok: false, slug, message: 'This connection link was already used. Please start again.' };

  // Re-check the user's current permission in the workspace (role may have changed).
  const ctx = await loadCtx(user, { id: row.workspaceId });
  if (!ctx) return { ok: false, slug: null, message: 'You are no longer a member of this workspace.' };
  try {
    assertCan(ctx, 'channels.manage');
  } catch {
    return { ok: false, slug, message: "You don't have permission to connect channels in this workspace." };
  }

  if (params.error) {
    return { ok: false, slug, message: params.error === 'access_denied' ? 'Connection cancelled. No channels were added.' : params.errorDescription || 'Facebook did not grant access.' };
  }
  if (!params.code) return { ok: false, slug, message: 'Facebook did not return an authorization code.' };

  let discovered: Awaited<ReturnType<typeof discoverMetaAccounts>>;
  try {
    discovered = integrationMode() === 'MOCK' ? mockDiscovery(row.workspaceId.slice(-6)) : await discoverMetaAccounts(params.code);
  } catch (err) {
    console.error('[meta] discovery failed', err);
    return { ok: false, slug, message: `Couldn't read your accounts from Meta: ${(err as Error).message}` };
  }
  const pending = await db.pendingConnection.create({
    data: {
      workspaceId: row.workspaceId,
      userId: user.id,
      provider: 'meta',
      payloadEnc: encryptJson(discovered),
      expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    },
  });
  await audit({ action: 'channel.oauth_completed', actorId: user.id, workspaceId: row.workspaceId, metadata: { found: discovered.accounts.length, declined: discovered.declined } });
  return { ok: true, slug, pendingId: pending.id };
}

async function loadPending(ctx: WorkspaceCtx, pendingId: string) {
  const p = await db.pendingConnection.findFirst({ where: { id: pendingId, workspaceId: ctx.workspace.id, userId: ctx.user.id } });
  if (!p || p.expiresAt < new Date()) throw notFound('Connection request');
  return { row: p, data: decryptJson<ReturnType<typeof mockDiscovery>>(p.payloadEnc) };
}

/** The accounts found during OAuth, without their tokens. */
export async function getPendingConnection(ctx: WorkspaceCtx, pendingId: string) {
  assertCan(ctx, 'channels.manage');
  const { data } = await loadPending(ctx, pendingId);
  const existing = await db.socialAccount.findMany({ where: { workspaceId: ctx.workspace.id }, select: { platform: true, externalId: true, status: true } });
  const plan = await getWorkspacePlan(ctx.workspace.id);
  const active = existing.filter((e) => e.status !== 'DISCONNECTED').length;
  return {
    fbUserName: data.fbUserName,
    declined: data.declined,
    mode: integrationMode(),
    limit: limitOf(plan, 'social_accounts'),
    used: active,
    planName: plan.planName,
    accounts: data.accounts.map((a) => {
      const prev = existing.find((e) => e.platform === a.platform && e.externalId === a.externalId);
      return {
        key: a.key,
        platform: a.platform,
        name: a.name,
        username: a.username,
        avatarUrl: a.avatarUrl,
        blockedReason: a.blockedReason,
        connected: !!prev && prev.status !== 'DISCONNECTED',
        reconnect: !!prev,
        missingPermissions: adapterFor({ platform: a.platform, mode: integrationMode() }).capabilities({ scopes: a.scopes }).missing,
      };
    }),
  };
}

export const confirmSchema = z.object({ keys: z.array(z.string().max(200)).min(1, 'Select at least one account').max(50) });

export async function confirmPendingConnection(ctx: WorkspaceCtx, pendingId: string, keys: string[]) {
  assertCan(ctx, 'channels.manage');
  const { row, data } = await loadPending(ctx, pendingId);
  const chosen = data.accounts.filter((a) => keys.includes(a.key) && !a.blockedReason);
  if (chosen.length === 0) throw badRequest('Select at least one account that can be connected.');

  const plan = await getWorkspacePlan(ctx.workspace.id);
  const existing = await db.socialAccount.findMany({ where: { workspaceId: ctx.workspace.id } });
  const active = existing.filter((e) => e.status !== 'DISCONNECTED').length;
  const newOnes = chosen.filter((a) => !existing.some((e) => e.platform === a.platform && e.externalId === a.externalId && e.status !== 'DISCONNECTED'));
  assertWithinLimit(plan, 'social_accounts', active, newOnes.length);

  const mode = integrationMode();
  const saved = await db.$transaction(async (tx) => {
    const out: string[] = [];
    for (const a of chosen) {
      const data = {
        name: a.name,
        username: a.username,
        avatarUrl: a.avatarUrl,
        accessTokenEnc: encrypt(a.accessToken),
        tokenExpiresAt: a.tokenExpiresAt ? new Date(a.tokenExpiresAt) : null,
        scopes: a.scopes,
        status: 'CONNECTED' as const,
        mode,
        lastError: null,
        lastCheckedAt: new Date(),
        metadata: a.metadata as Prisma.InputJsonValue,
        connectedById: ctx.user.id,
      };
      const acc = await tx.socialAccount.upsert({
        where: { workspaceId_platform_externalId: { workspaceId: ctx.workspace.id, platform: a.platform, externalId: a.externalId } },
        create: { ...data, workspaceId: ctx.workspace.id, platform: a.platform, externalId: a.externalId },
        update: data,
      });
      out.push(acc.id);
    }
    await tx.pendingConnection.delete({ where: { id: row.id } });
    return out;
  });
  await audit({ action: 'channel.connected', actorId: ctx.user.id, workspaceId: ctx.workspace.id, metadata: { accounts: chosen.map((c) => c.key), mode } });
  return { connected: saved.length };
}

// ---------------------------------------------------------------------------
// Management
// ---------------------------------------------------------------------------

export async function listChannels(ctx: WorkspaceCtx) {
  assertCan(ctx, 'channels.view');
  const rows = await db.socialAccount.findMany({
    where: { workspaceId: ctx.workspace.id, status: { not: 'DISCONNECTED' } },
    orderBy: { createdAt: 'asc' },
    include: { connectedBy: { select: { name: true, email: true } }, _count: { select: { platformPosts: { where: { status: 'SCHEDULED' } } } } },
  });
  const plan = await getWorkspacePlan(ctx.workspace.id);
  return {
    mode: integrationMode(),
    limit: limitOf(plan, 'social_accounts'),
    planName: plan.planName,
    channels: rows.map((r) => {
      const caps = adapterFor(r).capabilities({ scopes: r.scopes });
      return {
        id: r.id,
        platform: r.platform,
        name: r.name,
        username: r.username,
        avatarUrl: r.avatarUrl,
        status: r.status,
        mode: r.mode,
        lastError: r.lastError,
        lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
        tokenExpiresAt: r.tokenExpiresAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        connectedBy: r.connectedBy?.name ?? r.connectedBy?.email ?? null,
        scheduledCount: r._count.platformPosts,
        capabilities: caps,
        pageName: (r.metadata as { pageName?: string } | null)?.pageName ?? null,
      };
    }),
  };
}

/**
 * Disconnecting deletes the stored token. Scheduled posts for the channel are cancelled so
 * nothing tries to publish with a missing token.
 */
export async function disconnectChannel(ctx: WorkspaceCtx, id: string) {
  assertCan(ctx, 'channels.manage');
  const acc = await db.socialAccount.findFirst({ where: { id, workspaceId: ctx.workspace.id, status: { not: 'DISCONNECTED' } } });
  if (!acc) throw notFound('Channel');
  const scheduled = await db.$transaction(async (tx) => {
    const versions = await tx.platformPost.findMany({ where: { socialAccountId: id, status: { in: ['SCHEDULED', 'DRAFT'] } } });
    const sched = versions.filter((v) => v.status === 'SCHEDULED');
    await tx.platformPost.updateMany({
      where: { id: { in: sched.map((v) => v.id) }, status: 'SCHEDULED' },
      data: { status: 'CANCELLED', lastError: 'Channel was disconnected.' },
    });
    await tx.socialAccount.update({
      where: { id },
      data: { status: 'DISCONNECTED', accessTokenEnc: encrypt('revoked'), lastError: null, scopes: [] },
    });
    for (const postId of new Set(versions.map((v) => v.postId))) await refreshPostStatus(postId, tx);
    return sched;
  });
  await removePublishJobs(scheduled.map((v) => ({ id: v.id, scheduledAt: v.scheduledAt })));
  await audit({ action: 'channel.disconnected', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'social_account', targetId: id, metadata: { cancelled: scheduled.length } });
  return { cancelledPosts: scheduled.length };
}

/** Verifies the token still works and updates the channel status. */
export async function checkChannel(ctx: WorkspaceCtx, id: string) {
  assertCan(ctx, 'channels.view');
  const acc = await db.socialAccount.findFirst({ where: { id, workspaceId: ctx.workspace.id, status: { not: 'DISCONNECTED' } } });
  if (!acc) throw notFound('Channel');
  return runHealthCheck(acc);
}

export async function runHealthCheck(acc: SocialAccount) {
  const res = await adapterFor(acc).checkHealth(toAccountRef(acc));
  const status = res.ok ? 'CONNECTED' : res.kind === 'auth' ? 'NEEDS_REAUTH' : acc.status === 'NEEDS_REAUTH' ? 'NEEDS_REAUTH' : 'ERROR';
  await db.socialAccount.update({
    where: { id: acc.id },
    data: { status: res.ok ? 'CONNECTED' : status, lastError: res.ok ? null : res.message, lastCheckedAt: new Date() },
  });
  return res.ok ? { ok: true as const, status: 'CONNECTED' as const } : { ok: false as const, status, message: res.message };
}

export type DiscoveredAccountPublic = Omit<DiscoveredAccount, 'accessToken'>;
