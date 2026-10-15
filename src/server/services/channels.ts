import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { Prisma, SocialAccount } from '@prisma/client';
import { db } from '../db';
import { env } from '../env';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { decrypt, decryptJson, encrypt, encryptJson, hashToken, randomToken, safeEqual } from '../crypto';
import { assertCan, loadCtx, type WorkspaceCtx } from '../auth/ctx';
import { adapterFor } from '../adapters/registry';
import type { DiscoveredAccount, Discovery } from '../integrations/types';
import { mockDiscovery } from '../integrations/mock';
import { PROVIDERS, mockMode, platformAvailable, platformMode, providerFor } from '../integrations/providers';
import { accountRef } from '../integrations/tokens';
import { removePublishJobs } from '../queue/producer';
import { refreshPostStatus } from '../publishing/status';
import { ACCOUNT_NOUN, PLATFORMS, PLATFORM_INFO, PLATFORM_PROVIDER, type Platform, type Provider } from '@/lib/platforms';
import { findProject, lockProject } from './projects';

export { toAccountRef } from '../integrations/tokens';

const STATE_TTL_MS = 10 * 60 * 1000;
const PENDING_TTL_MS = 30 * 60 * 1000;

/** Mode shown in the Meta banners (mock / Meta development / live). */
export function integrationMode(): 'MOCK' | 'DEVELOPMENT' | 'LIVE' {
  const m = env().META_MODE;
  return m === 'mock' ? 'MOCK' : m === 'live' ? 'LIVE' : 'DEVELOPMENT';
}

/** Which platforms can be connected on this server (credentials configured, or mock mode). */
export function availablePlatforms(): Record<Platform, boolean> {
  return Object.fromEntries(PLATFORMS.map((p) => [p, platformAvailable(p)])) as Record<Platform, boolean>;
}

// ---------------------------------------------------------------------------
// OAuth start / callback
// ---------------------------------------------------------------------------

export const connectQuerySchema = z.object({
  project: z.string().min(1).max(40),
  platform: z.enum(PLATFORMS),
});

const pkceChallenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

/**
 * Starts an OAuth connection for one project slot (e.g. its Instagram account or its YouTube
 * channel). The random state is stored hashed and bound to this user, workspace, project and
 * platform; the raw value is also set in an httpOnly cookie so the callback must happen in the
 * same browser. X additionally uses PKCE; the verifier is stored encrypted with the state.
 */
export async function startConnect(ctx: WorkspaceCtx, projectId: string, platform: Platform) {
  assertCan(ctx, 'channels.manage');
  if (!ctx.user.emailVerified) throw forbidden('Verify your email address before connecting channels.');
  if (!(PLATFORMS as readonly string[]).includes(platform)) throw badRequest('This platform is not supported yet.');
  if (!platformAvailable(platform)) throw badRequest(`${PLATFORM_INFO[platform].label} isn't set up on this server yet. Ask the administrator to add its app credentials.`);
  await findProject(ctx, projectId);
  const provider = providerFor(platform);
  const state = randomToken(24);
  const verifier = provider.usesPkce ? randomToken(48) : null;
  await db.oAuthState.create({
    data: {
      stateHash: hashToken(state),
      workspaceId: ctx.workspace.id,
      projectId,
      platform,
      userId: ctx.user.id,
      provider: provider.id,
      codeVerifierEnc: verifier ? encrypt(verifier) : null,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    },
  });
  const redirectUrl = mockMode()
    ? `${env().APP_URL}/api/oauth/${provider.id}/callback?code=mock&state=${state}`
    : provider.authUrl(state, verifier ? pkceChallenge(verifier) : undefined);
  return { state, redirectUrl };
}

export type CallbackResult = { ok: true; slug: string; pendingId: string } | { ok: false; slug: string | null; message: string };

export async function handleCallback(
  providerId: Provider,
  user: { id: string; email: string; name: string | null; emailVerified: Date | null },
  params: { code?: string | null; state?: string | null; error?: string | null; errorDescription?: string | null },
  cookieState: string | undefined,
): Promise<CallbackResult> {
  const provider = PROVIDERS[providerId];
  if (!params.state) return { ok: false, slug: null, message: 'The connection request is missing its security token. Please try again.' };
  const row = await db.oAuthState.findUnique({ where: { stateHash: hashToken(params.state) }, include: { workspace: { select: { slug: true } } } });
  if (!row || row.provider !== providerId) return { ok: false, slug: null, message: 'This connection link is invalid. Please try again.' };
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
    return {
      ok: false,
      slug,
      message: ['access_denied', 'user_cancelled_authorize', 'user_cancelled_login'].includes(params.error)
        ? 'Connection cancelled. No channels were added.'
        : params.errorDescription || `${provider.label} did not grant access.`,
    };
  }
  if (!params.code) return { ok: false, slug, message: `${provider.label} did not return an authorization code.` };

  let discovered: Discovery;
  try {
    discovered = mockMode()
      ? mockDiscovery(row.workspaceId.slice(-6))
      : await provider.discover(params.code, row.codeVerifierEnc ? decrypt(row.codeVerifierEnc) : undefined);
  } catch (err) {
    console.error(`[${providerId}] discovery failed`, err);
    return { ok: false, slug, message: `Couldn't read your accounts from ${provider.label}: ${(err as Error).message}` };
  }
  const pending = await db.pendingConnection.create({
    data: {
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      platform: row.platform,
      userId: user.id,
      provider: providerId,
      payloadEnc: encryptJson(discovered),
      expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    },
  });
  await audit({ action: 'channel.oauth_completed', actorId: user.id, workspaceId: row.workspaceId, metadata: { provider: providerId, found: discovered.accounts.length, declined: discovered.declined } });
  return { ok: true, slug, pendingId: pending.id };
}

async function loadPending(ctx: WorkspaceCtx, pendingId: string) {
  const p = await db.pendingConnection.findFirst({
    where: { id: pendingId, workspaceId: ctx.workspace.id, userId: ctx.user.id },
    include: { project: { select: { id: true, name: true } } },
  });
  if (!p || p.expiresAt < new Date()) throw notFound('Connection request');
  const data = decryptJson<Discovery>(p.payloadEnc);
  // Only accounts of the platform this project slot is for.
  return { row: p, data: { ...data, accounts: data.accounts.filter((a) => a.platform === p.platform) } };
}

/** The accounts found during OAuth for one project slot, without their tokens. */
export async function getPendingConnection(ctx: WorkspaceCtx, pendingId: string) {
  assertCan(ctx, 'channels.manage');
  const { row, data } = await loadPending(ctx, pendingId);
  const existing = await db.socialAccount.findMany({
    where: { workspaceId: ctx.workspace.id, platform: row.platform },
    select: { externalId: true, status: true, projectId: true, name: true, username: true, project: { select: { name: true } } },
  });
  const current = existing.find((e) => e.projectId === row.projectId && e.status !== 'DISCONNECTED') ?? null;
  return {
    signedInAs: data.signedInAs,
    providerLabel: PROVIDERS[PLATFORM_PROVIDER[row.platform]].label,
    accountNoun: ACCOUNT_NOUN[row.platform],
    declined: data.declined,
    mode: platformMode(row.platform),
    project: row.project,
    platform: row.platform,
    platformLabel: PLATFORM_INFO[row.platform].label,
    current: current ? { externalId: current.externalId, name: current.username ? `@${current.username}` : current.name } : null,
    accounts: data.accounts.map((a) => {
      const prev = existing.find((e) => e.externalId === a.externalId);
      const active = !!prev && prev.status !== 'DISCONNECTED';
      const otherProject = active && prev.projectId !== row.projectId ? prev.project.name : null;
      const replacesOther = !!current && current.externalId !== a.externalId;
      return {
        key: a.key,
        platform: a.platform,
        name: a.name,
        username: a.username,
        avatarUrl: a.avatarUrl,
        blockedReason:
          a.blockedReason ??
          (otherProject
            ? `Already linked to the project “${otherProject}”. Disconnect it there first.`
            : replacesOther
              ? `This project already has ${current.name}. Disconnect it first to link a different account.`
              : null),
        connected: active && !otherProject,
        reconnect: !!prev,
        missingPermissions: adapterFor({ platform: a.platform, mode: platformMode(a.platform) }).capabilities({ scopes: a.scopes, metadata: a.metadata }).missing,
      };
    }),
  };
}

export const confirmSchema = z.object({ key: z.string().min(1, 'Select an account').max(200) });

/**
 * Links the chosen account to the project. A project holds at most one account per platform,
 * and an account can be active in only one project of the workspace.
 */
export async function confirmPendingConnection(ctx: WorkspaceCtx, pendingId: string, key: string) {
  assertCan(ctx, 'channels.manage');
  const { row, data } = await loadPending(ctx, pendingId);
  const a = data.accounts.find((x) => x.key === key);
  if (!a) throw badRequest('Select an account to connect.');
  if (a.blockedReason) throw badRequest(a.blockedReason);
  const label = PLATFORM_INFO[row.platform].label;

  const mode = platformMode(row.platform);
  const saved = await db.$transaction(async (tx) => {
    await lockProject(tx, ctx.workspace.id, row.projectId);
    const current = await tx.socialAccount.findFirst({ where: { projectId: row.projectId, platform: row.platform, status: { not: 'DISCONNECTED' } } });
    if (current && current.externalId !== a.externalId) {
      throw conflict(`This project already has a ${label} account (${current.username ? `@${current.username}` : current.name}). Disconnect it first.`);
    }
    const prev = await tx.socialAccount.findUnique({
      where: { workspaceId_platform_externalId: { workspaceId: ctx.workspace.id, platform: a.platform, externalId: a.externalId } },
      include: { project: { select: { name: true } } },
    });
    if (prev && prev.status !== 'DISCONNECTED' && prev.projectId !== row.projectId) {
      throw conflict(`This account is already linked to the project “${prev.project.name}”. Disconnect it there first.`);
    }
    const fields = {
      projectId: row.projectId,
      name: a.name,
      username: a.username,
      avatarUrl: a.avatarUrl,
      accessTokenEnc: encrypt(a.accessToken),
      tokenExpiresAt: a.tokenExpiresAt ? new Date(a.tokenExpiresAt) : null,
      refreshTokenEnc: a.refreshToken ? encrypt(a.refreshToken) : null,
      refreshTokenExpiresAt: a.refreshTokenExpiresAt ? new Date(a.refreshTokenExpiresAt) : null,
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
      create: { ...fields, workspaceId: ctx.workspace.id, platform: a.platform, externalId: a.externalId },
      update: fields,
    });
    await tx.pendingConnection.delete({ where: { id: row.id } });
    return acc;
  });
  await audit({
    action: 'channel.connected',
    actorId: ctx.user.id,
    workspaceId: ctx.workspace.id,
    targetType: 'social_account',
    targetId: saved.id,
    metadata: { account: a.key, projectId: row.projectId, mode },
  });
  return { connected: 1, channelId: saved.id, projectId: row.projectId };
}

// ---------------------------------------------------------------------------
// Management
// ---------------------------------------------------------------------------

type ChannelRow = SocialAccount & { connectedBy: { name: string | null; email: string } | null; _count: { platformPosts: number } };

export function channelDto(r: ChannelRow) {
  return {
    id: r.id,
    projectId: r.projectId,
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
    capabilities: adapterFor(r).capabilities(r),
    pageName: (r.metadata as { pageName?: string } | null)?.pageName ?? null,
  };
}

export type ChannelDto = ReturnType<typeof channelDto>;

export async function listChannels(ctx: WorkspaceCtx) {
  assertCan(ctx, 'channels.view');
  const rows = await db.socialAccount.findMany({
    where: { workspaceId: ctx.workspace.id, status: { not: 'DISCONNECTED' } },
    orderBy: { createdAt: 'asc' },
    include: { connectedBy: { select: { name: true, email: true } }, _count: { select: { platformPosts: { where: { status: 'SCHEDULED' } } } } },
  });
  return { mode: integrationMode(), channels: rows.map(channelDto) };
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
  let ref;
  try {
    ref = await accountRef(acc);
  } catch (err) {
    const message = (err as Error).message;
    await db.socialAccount.update({ where: { id: acc.id }, data: { status: 'NEEDS_REAUTH', lastError: message, lastCheckedAt: new Date() } });
    return { ok: false as const, status: 'NEEDS_REAUTH' as const, message };
  }
  const res = await adapterFor(acc).checkHealth(ref);
  const status = res.ok ? 'CONNECTED' : res.kind === 'auth' ? 'NEEDS_REAUTH' : acc.status === 'NEEDS_REAUTH' ? 'NEEDS_REAUTH' : 'ERROR';
  await db.socialAccount.update({
    where: { id: acc.id },
    data: { status: res.ok ? 'CONNECTED' : status, lastError: res.ok ? null : res.message, lastCheckedAt: new Date() },
  });
  return res.ok ? { ok: true as const, status: 'CONNECTED' as const } : { ok: false as const, status, message: res.message };
}

export type DiscoveredAccountPublic = Omit<DiscoveredAccount, 'accessToken' | 'refreshToken'>;
