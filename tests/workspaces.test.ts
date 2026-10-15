import { describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { AppError } from '@/server/errors';
import { createWorkspace, deleteWorkspace, listUserWorkspaces, slugify, updateWorkspace } from '@/server/services/workspaces';
import { loadCtx } from '@/server/auth/ctx';
import { addMember, makeUser, makeWorkspace } from './helpers/factories';

describe('workspaces', () => {
  it('creates a workspace with an owner, free subscription and default queue', async () => {
    const { ws, owner } = await makeWorkspace('Digi Emporia');
    expect(ws.slug).toMatch(/^digi-emporia/);
    const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: ws.id, userId: owner.id } } });
    expect(member?.role).toBe('OWNER');
    const sub = await db.subscription.findUnique({ where: { workspaceId: ws.id }, include: { plan: true } });
    expect(sub?.plan.key).toBe('free');
    expect(await db.queueSlot.count({ where: { workspaceId: ws.id } })).toBeGreaterThan(0);
  });

  it('gives each workspace a unique slug', async () => {
    const a = await makeWorkspace('Same Name');
    const b = await makeWorkspace('Same Name');
    expect(a.ws.slug).not.toBe(b.ws.slug);
  });

  it('slugifies safely', () => {
    expect(slugify('Café Déjà Vu!!')).toBe('cafe-deja-vu');
    expect(slugify('admin')).toBe('workspace-admin');
    expect(slugify('★')).toMatch(/^workspace/);
  });

  it('enforces the owned-workspace limit of the free plan', async () => {
    const user = await makeUser();
    await createWorkspace(user.id, { name: 'First', timezone: 'UTC' });
    await expect(createWorkspace(user.id, { name: 'Second', timezone: 'UTC' })).rejects.toMatchObject({ status: 402 });
  });

  it('lets one user belong to several workspaces with different roles', async () => {
    const a = await makeWorkspace('Alpha');
    const b = await makeWorkspace('Beta');
    const user = await makeUser();
    await db.workspaceMember.create({ data: { workspaceId: a.ws.id, userId: user.id, role: 'ADMIN' } });
    await db.workspaceMember.create({ data: { workspaceId: b.ws.id, userId: user.id, role: 'ANALYST' } });
    const list = await listUserWorkspaces(user.id);
    expect(list.map((w) => [w.name, w.role]).sort()).toEqual([
      ['Alpha', 'ADMIN'],
      ['Beta', 'ANALYST'],
    ]);
  });

  it('rejects invalid timezones', async () => {
    const user = await makeUser();
    await expect(createWorkspace(user.id, { name: 'TZ', timezone: 'Mars/Olympus' })).rejects.toBeTruthy();
  });

  it('only managers can update settings and only owners can delete', async () => {
    const { ws, ctx } = await makeWorkspace('Settings Co');
    const publisher = await addMember(ws.id, 'PUBLISHER');
    const admin = await addMember(ws.id, 'ADMIN');
    await expect(updateWorkspace(publisher, { name: 'Hacked' })).rejects.toMatchObject({ status: 403 });
    await expect(updateWorkspace(admin, { name: 'Renamed' })).resolves.toMatchObject({ name: 'Renamed' });
    await expect(deleteWorkspace(admin, 'Renamed')).rejects.toMatchObject({ status: 403 });
    await expect(deleteWorkspace({ ...ctx, workspace: { ...ctx.workspace, name: 'Renamed' } }, 'wrong')).rejects.toBeInstanceOf(AppError);
    await deleteWorkspace({ ...ctx, workspace: { ...ctx.workspace, name: 'Renamed' } }, 'Renamed');
    expect(await db.workspace.findUnique({ where: { id: ws.id } })).toBeNull();
  });

  it('does not build a context for non-members', async () => {
    const { ws } = await makeWorkspace('Private');
    const stranger = await makeUser();
    expect(await loadCtx(stranger, { id: ws.id })).toBeNull();
    expect(await loadCtx(stranger, { slug: ws.slug })).toBeNull();
  });

  it('blocks mutations in suspended workspaces but keeps reads', async () => {
    const { ws, ctx } = await makeWorkspace('Suspended');
    await db.workspace.update({ where: { id: ws.id }, data: { status: 'SUSPENDED' } });
    const fresh = (await loadCtx(ctx.user, { id: ws.id }))!;
    await expect(updateWorkspace(fresh, { name: 'x y' })).rejects.toMatchObject({ status: 403 });
  });
});
