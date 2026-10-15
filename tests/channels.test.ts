import { describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { decrypt } from '@/server/crypto';
import { confirmPendingConnection, disconnectChannel, getPendingConnection, handleMetaCallback, listChannels, startMetaConnect } from '@/server/services/channels';
import { createPost } from '@/server/services/posts';
import { createProject } from '@/server/services/projects';
import { addMember, makeUser, makeWorkspace } from './helpers/factories';

type Ctx = Awaited<ReturnType<typeof makeWorkspace>>['ctx'];

async function firstProject(ctx: Ctx) {
  return db.project.findFirstOrThrow({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: 'asc' } });
}

async function connectMock(ctx: Ctx, projectId?: string, platform: 'INSTAGRAM' | 'FACEBOOK' = 'FACEBOOK') {
  const pid = projectId ?? (await firstProject(ctx)).id;
  const { state, redirectUrl } = await startMetaConnect(ctx, pid, platform);
  expect(redirectUrl).toContain('/api/oauth/meta/callback?code=mock');
  const res = await handleMetaCallback(ctx.user, { code: 'mock', state }, state);
  if (!res.ok) throw new Error(res.message);
  return res.pendingId;
}

describe('channel connection (mock Meta)', () => {
  it('links one account to a project slot with an encrypted token', async () => {
    const { ctx, ws } = await makeWorkspace('Connect Co');
    const project = await firstProject(ctx);
    const pendingId = await connectMock(ctx, project.id, 'FACEBOOK');
    const pending = await getPendingConnection(ctx, pendingId);
    // Only accounts for the slot's platform are offered.
    expect(pending.accounts.length).toBeGreaterThan(1);
    expect(pending.accounts.every((a) => a.platform === 'FACEBOOK')).toBe(true);
    expect(pending.project.id).toBe(project.id);
    expect(JSON.stringify(pending)).not.toContain('mock-token');

    await confirmPendingConnection(ctx, pendingId, pending.accounts[0]!.key);
    const rows = await db.socialAccount.findMany({ where: { workspaceId: ws.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.projectId).toBe(project.id);
    expect(rows[0]!.accessTokenEnc).not.toContain('mock-token');
    expect(decrypt(rows[0]!.accessTokenEnc)).toBe('mock-token');
    expect(rows[0]!.mode).toBe('MOCK');
    // The pending selection is single-use.
    await expect(getPendingConnection(ctx, pendingId)).rejects.toMatchObject({ status: 404 });

    const list = await listChannels(ctx);
    expect(list.channels).toHaveLength(1);
  });

  it('allows one Instagram and one Facebook account per project, each in one project only', async () => {
    const { ctx } = await makeWorkspace('Slots Co');
    const a = await firstProject(ctx);
    const b = await createProject(ctx, { name: 'Second brand' });

    // Fill project A's Facebook slot with page 1, and its Instagram slot.
    let pendingId = await connectMock(ctx, a.id, 'FACEBOOK');
    let pending = await getPendingConnection(ctx, pendingId);
    const [page1, page2] = pending.accounts;
    await confirmPendingConnection(ctx, pendingId, page1!.key);
    pendingId = await connectMock(ctx, a.id, 'INSTAGRAM');
    pending = await getPendingConnection(ctx, pendingId);
    await confirmPendingConnection(ctx, pendingId, pending.accounts[0]!.key);

    // A second Facebook Page can't go into project A.
    pendingId = await connectMock(ctx, a.id, 'FACEBOOK');
    pending = await getPendingConnection(ctx, pendingId);
    expect(pending.current).not.toBeNull();
    expect(pending.accounts.find((x) => x.key === page2!.key)!.blockedReason).toContain('already has');
    expect(pending.accounts.find((x) => x.key === page1!.key)).toMatchObject({ blockedReason: null, connected: true });
    await expect(confirmPendingConnection(ctx, pendingId, page2!.key)).rejects.toMatchObject({ status: 409 });
    // Reconnecting the same page refreshes it.
    await confirmPendingConnection(ctx, pendingId, page1!.key);

    // Page 1 can't also be linked to project B while active in A.
    pendingId = await connectMock(ctx, b.id, 'FACEBOOK');
    pending = await getPendingConnection(ctx, pendingId);
    expect(pending.accounts.find((x) => x.key === page1!.key)!.blockedReason).toContain('Already linked');
    await expect(confirmPendingConnection(ctx, pendingId, page1!.key)).rejects.toMatchObject({ status: 409 });
    // Page 2 goes into project B fine.
    await confirmPendingConnection(ctx, pendingId, page2!.key);

    // Disconnecting page 1 frees A's Facebook slot; page 1 can be linked again (page 2 stays in B).
    const acc1 = await db.socialAccount.findFirstOrThrow({ where: { workspaceId: ctx.workspace.id, externalId: page1!.key.split(':')[1]! } });
    await disconnectChannel(ctx, acc1.id);
    const c = await createProject(ctx, { name: 'Third brand' }).catch((e) => e);
    expect(c).toMatchObject({ status: 402 }); // Free plan: 2 projects
    pendingId = await connectMock(ctx, a.id, 'FACEBOOK');
    pending = await getPendingConnection(ctx, pendingId);
    expect(pending.current).toBeNull();
    expect(pending.accounts.find((x) => x.key === page2!.key)!.blockedReason).toContain('Already linked');
    await confirmPendingConnection(ctx, pendingId, page1!.key);

    const active = await db.socialAccount.findMany({ where: { workspaceId: ctx.workspace.id, status: { not: 'DISCONNECTED' } } });
    expect(active.map((x) => `${x.projectId === a.id ? 'A' : 'B'}:${x.platform}`).sort()).toEqual(['A:FACEBOOK', 'A:INSTAGRAM', 'B:FACEBOOK']);
  });

  it('serialises concurrent confirmations into the same slot', async () => {
    const { ctx } = await makeWorkspace('Race Co');
    const p = await firstProject(ctx);
    const first = await connectMock(ctx, p.id, 'FACEBOOK');
    const second = await connectMock(ctx, p.id, 'FACEBOOK');
    const [k1, k2] = (await getPendingConnection(ctx, first)).accounts.map((a) => a.key);
    const results = await Promise.allSettled([confirmPendingConnection(ctx, first, k1!), confirmPendingConnection(ctx, second, k2!)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.socialAccount.count({ where: { projectId: p.id, status: { not: 'DISCONNECTED' } } })).toBe(1);
  });

  it('rejects state mismatch, reuse, expiry and other users', async () => {
    const { ctx } = await makeWorkspace('State Co');
    const project = await firstProject(ctx);
    const { state } = await startMetaConnect(ctx, project.id, 'FACEBOOK');
    expect((await handleMetaCallback(ctx.user, { code: 'mock', state }, 'different-cookie')).ok).toBe(false);
    const other = await makeUser();
    expect(await handleMetaCallback(other, { code: 'mock', state }, state)).toMatchObject({ ok: false, message: expect.stringContaining('different user') });
    expect((await handleMetaCallback(ctx.user, { code: 'mock', state }, state)).ok).toBe(true);
    expect(await handleMetaCallback(ctx.user, { code: 'mock', state }, state)).toMatchObject({ ok: false, message: expect.stringContaining('already used') });

    const { state: s2 } = await startMetaConnect(ctx, project.id, 'INSTAGRAM');
    await db.oAuthState.updateMany({ where: { workspaceId: ctx.workspace.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await handleMetaCallback(ctx.user, { code: 'mock', state: s2 }, s2)).toMatchObject({ ok: false, message: expect.stringContaining('expired') });
    expect((await handleMetaCallback(ctx.user, { code: 'mock', state: 'forged' }, 'forged')).ok).toBe(false);
  });

  it('reports a cancelled Facebook dialog without connecting anything', async () => {
    const { ctx, ws } = await makeWorkspace('Cancel Co');
    const { state } = await startMetaConnect(ctx, (await firstProject(ctx)).id, 'INSTAGRAM');
    const res = await handleMetaCallback(ctx.user, { state, error: 'access_denied' }, state);
    expect(res).toMatchObject({ ok: false, message: expect.stringContaining('cancelled') });
    expect(await db.socialAccount.count({ where: { workspaceId: ws.id } })).toBe(0);
  });

  it('enforces permissions, verification and workspace boundaries', async () => {
    const { ctx, ws } = await makeWorkspace('Limits Co');
    const project = await firstProject(ctx);
    const publisher = await addMember(ws.id, 'PUBLISHER');
    await expect(startMetaConnect(publisher, project.id, 'FACEBOOK')).rejects.toMatchObject({ status: 403 });
    await expect(startMetaConnect({ ...ctx, user: { ...ctx.user, emailVerified: null } }, project.id, 'FACEBOOK')).rejects.toMatchObject({ status: 403 });

    const pendingId = await connectMock(ctx, project.id);
    const pending = await getPendingConnection(ctx, pendingId);
    const other = await makeWorkspace('Other Co');
    // Another workspace can't target this project or use this pending selection.
    await expect(startMetaConnect(other.ctx, project.id, 'FACEBOOK')).rejects.toMatchObject({ status: 404 });
    await expect(getPendingConnection(other.ctx, pendingId)).rejects.toMatchObject({ status: 404 });
    await expect(confirmPendingConnection(other.ctx, pendingId, pending.accounts[0]!.key)).rejects.toMatchObject({ status: 404 });
  });

  it('disconnecting wipes the token and cancels scheduled posts', async () => {
    const { ctx, ws } = await makeWorkspace('Disconnect Co');
    const pendingId = await connectMock(ctx);
    const pending = await getPendingConnection(ctx, pendingId);
    await confirmPendingConnection(ctx, pendingId, pending.accounts[0]!.key);
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
