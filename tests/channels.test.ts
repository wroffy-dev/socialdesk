import { describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { decrypt } from '@/server/crypto';
import { confirmPendingConnection, disconnectChannel, getPendingConnection, handleMetaCallback, listChannels, startMetaConnect } from '@/server/services/channels';
import { createPost } from '@/server/services/posts';
import { addMember, makeUser, makeWorkspace } from './helpers/factories';

async function connectMock(ctx: Awaited<ReturnType<typeof makeWorkspace>>['ctx']) {
  const { state, redirectUrl } = await startMetaConnect(ctx);
  expect(redirectUrl).toContain('/api/oauth/meta/callback?code=mock');
  const res = await handleMetaCallback(ctx.user, { code: 'mock', state }, state);
  if (!res.ok) throw new Error(res.message);
  return res.pendingId;
}

describe('channel connection (mock Meta)', () => {
  it('connects selected accounts with encrypted tokens', async () => {
    const { ctx, ws } = await makeWorkspace('Connect Co');
    const pendingId = await connectMock(ctx);
    const pending = await getPendingConnection(ctx, pendingId);
    expect(pending.accounts.length).toBeGreaterThan(1);
    expect(JSON.stringify(pending)).not.toContain('mock-token');

    const keys = pending.accounts.slice(0, 2).map((a) => a.key);
    await confirmPendingConnection(ctx, pendingId, keys);
    const rows = await db.socialAccount.findMany({ where: { workspaceId: ws.id } });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.accessTokenEnc).not.toContain('mock-token');
    expect(decrypt(rows[0]!.accessTokenEnc)).toBe('mock-token');
    expect(rows.every((r) => r.mode === 'MOCK')).toBe(true);
    // The pending selection is single-use.
    await expect(getPendingConnection(ctx, pendingId)).rejects.toMatchObject({ status: 404 });

    const list = await listChannels(ctx);
    expect(list.channels).toHaveLength(2);
  });

  it('rejects state mismatch, reuse, expiry and other users', async () => {
    const { ctx } = await makeWorkspace('State Co');
    const { state } = await startMetaConnect(ctx);
    expect((await handleMetaCallback(ctx.user, { code: 'mock', state }, 'different-cookie')).ok).toBe(false);
    const other = await makeUser();
    expect(await handleMetaCallback(other, { code: 'mock', state }, state)).toMatchObject({ ok: false, message: expect.stringContaining('different user') });
    expect((await handleMetaCallback(ctx.user, { code: 'mock', state }, state)).ok).toBe(true);
    expect(await handleMetaCallback(ctx.user, { code: 'mock', state }, state)).toMatchObject({ ok: false, message: expect.stringContaining('already used') });

    const { state: s2 } = await startMetaConnect(ctx);
    await db.oAuthState.updateMany({ where: { workspaceId: ctx.workspace.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await handleMetaCallback(ctx.user, { code: 'mock', state: s2 }, s2)).toMatchObject({ ok: false, message: expect.stringContaining('expired') });
    expect((await handleMetaCallback(ctx.user, { code: 'mock', state: 'forged' }, 'forged')).ok).toBe(false);
  });

  it('reports a cancelled Facebook dialog without connecting anything', async () => {
    const { ctx, ws } = await makeWorkspace('Cancel Co');
    const { state } = await startMetaConnect(ctx);
    const res = await handleMetaCallback(ctx.user, { state, error: 'access_denied' }, state);
    expect(res).toMatchObject({ ok: false, message: expect.stringContaining('cancelled') });
    expect(await db.socialAccount.count({ where: { workspaceId: ws.id } })).toBe(0);
  });

  it('enforces permissions, verification, plan limits and workspace boundaries', async () => {
    const { ctx, ws } = await makeWorkspace('Limits Co');
    const publisher = await addMember(ws.id, 'PUBLISHER');
    await expect(startMetaConnect(publisher)).rejects.toMatchObject({ status: 403 });
    await expect(startMetaConnect({ ...ctx, user: { ...ctx.user, emailVerified: null } })).rejects.toMatchObject({ status: 403 });

    const free = await db.plan.findUniqueOrThrow({ where: { key: 'free' }, include: { entitlements: true } });
    await db.entitlement.update({ where: { planId_key: { planId: free.id, key: 'social_accounts' } }, data: { limit: 1 } });
    try {
      const pendingId = await connectMock(ctx);
      const pending = await getPendingConnection(ctx, pendingId);
      await expect(confirmPendingConnection(ctx, pendingId, pending.accounts.slice(0, 2).map((a) => a.key))).rejects.toMatchObject({ status: 402 });

      const other = await makeWorkspace('Other Co');
      await expect(getPendingConnection(other.ctx, pendingId)).rejects.toMatchObject({ status: 404 });
      await expect(confirmPendingConnection(other.ctx, pendingId, [pending.accounts[0]!.key])).rejects.toMatchObject({ status: 404 });
    } finally {
      await db.entitlement.update({ where: { planId_key: { planId: free.id, key: 'social_accounts' } }, data: { limit: 3 } });
    }
  });

  it('disconnecting wipes the token and cancels scheduled posts', async () => {
    const { ctx, ws } = await makeWorkspace('Disconnect Co');
    const pendingId = await connectMock(ctx);
    const pending = await getPendingConnection(ctx, pendingId);
    const fbKey = pending.accounts.find((a) => a.platform === 'FACEBOOK')!.key;
    await confirmPendingConnection(ctx, pendingId, [fbKey]);
    const acc = await db.socialAccount.findFirstOrThrow({ where: { workspaceId: ws.id } });
    const post = await createPost(ctx, {
      baseCaption: 'later',
      versions: [{ socialAccountId: acc.id }],
      action: { type: 'schedule', scheduledAt: new Date(Date.now() + 7200_000).toISOString(), timezone: 'UTC' },
    });
    const other = await makeWorkspace('Not yours');
    await expect(disconnectChannel(other.ctx, acc.id)).rejects.toMatchObject({ status: 404 });

    const res = await disconnectChannel(ctx, acc.id);
    expect(res.cancelledPosts).toBe(1);
    const after = await db.socialAccount.findUniqueOrThrow({ where: { id: acc.id } });
    expect(after.status).toBe('DISCONNECTED');
    expect(decrypt(after.accessTokenEnc)).toBe('revoked');
    expect((await db.socialPost.findUniqueOrThrow({ where: { id: post.id } })).status).toBe('CANCELLED');
  });
});
