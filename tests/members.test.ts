import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/server/db';
import { acceptInvitation, changeMemberRole, inviteMember, listMembers, removeMember, revokeInvitation } from '@/server/services/members';
import { addMember, makeUser, makeWorkspace } from './helpers/factories';

async function lastInviteToken(email: string) {
  const dir = path.resolve('.data/mail');
  const files = (await readdir(dir)).filter((f) => f.includes(email.replace(/[^a-z0-9@._-]/gi, '_'))).sort();
  const mail = JSON.parse(await readFile(path.join(dir, files[files.length - 1]!), 'utf8'));
  return /\/invite\/([\w-]+)/.exec(mail.text)![1]!;
}

async function upgrade(workspaceId: string, planKey: string) {
  const plan = await db.plan.findUniqueOrThrow({ where: { key: planKey } });
  await db.subscription.update({ where: { workspaceId }, data: { planId: plan.id } });
}

describe('team members and invitations', () => {
  it('respects the plan seat limit (free = 1 member)', async () => {
    const { ctx } = await makeWorkspace('Solo');
    await expect(inviteMember(ctx, { email: 'friend@example.test', role: 'PUBLISHER' })).rejects.toMatchObject({ status: 402 });
  });

  it('invites, accepts and lists a member', async () => {
    const { ws, ctx } = await makeWorkspace('Team');
    await upgrade(ws.id, 'pro');
    const invitee = await makeUser({ verified: false });
    await inviteMember(ctx, { email: invitee.email, role: 'PUBLISHER' });
    const token = await lastInviteToken(invitee.email);

    const stranger = await makeUser();
    await expect(acceptInvitation(stranger, token)).rejects.toMatchObject({ status: 403 });

    const joined = await acceptInvitation(invitee, token);
    expect(joined.id).toBe(ws.id);
    await expect(acceptInvitation(invitee, token)).rejects.toMatchObject({ status: 400 });

    const { members } = await listMembers(ctx);
    expect(members.find((m) => m.user.id === invitee.id)?.role).toBe('PUBLISHER');
    expect((await db.user.findUnique({ where: { id: invitee.id } }))?.emailVerified).not.toBeNull();
  });

  it('prevents admins from inviting or promoting owners', async () => {
    const { ws } = await makeWorkspace('Hierarchy');
    await upgrade(ws.id, 'pro');
    const admin = await addMember(ws.id, 'ADMIN');
    await expect(inviteMember(admin, { email: 'boss@example.test', role: 'OWNER' })).rejects.toMatchObject({ status: 403 });
    const pub = await addMember(ws.id, 'PUBLISHER');
    const pubMember = await db.workspaceMember.findFirstOrThrow({ where: { workspaceId: ws.id, userId: pub.user.id } });
    await expect(changeMemberRole(admin, pubMember.id, 'OWNER')).rejects.toMatchObject({ status: 403 });
    await expect(changeMemberRole(admin, pubMember.id, 'ANALYST')).resolves.toMatchObject({ role: 'ANALYST' });
  });

  it('publishers and analysts cannot manage members', async () => {
    const { ws } = await makeWorkspace('Readers');
    await upgrade(ws.id, 'pro');
    const analyst = await addMember(ws.id, 'ANALYST');
    await expect(inviteMember(analyst, { email: 'x@example.test', role: 'ANALYST' })).rejects.toMatchObject({ status: 403 });
  });

  it('keeps at least one owner', async () => {
    const { ws, ctx } = await makeWorkspace('Owners');
    const ownerMember = await db.workspaceMember.findFirstOrThrow({ where: { workspaceId: ws.id, role: 'OWNER' } });
    await expect(changeMemberRole(ctx, ownerMember.id, 'ADMIN')).rejects.toMatchObject({ status: 400 });
    await expect(removeMember(ctx, ownerMember.id)).rejects.toMatchObject({ status: 400 });
  });

  it('cannot touch members or invitations of another workspace', async () => {
    const a = await makeWorkspace('Tenant A');
    const b = await makeWorkspace('Tenant B');
    await upgrade(b.ws.id, 'pro');
    const bMember = await db.workspaceMember.findFirstOrThrow({ where: { workspaceId: b.ws.id } });
    await expect(removeMember(a.ctx, bMember.id)).rejects.toMatchObject({ status: 404 });
    await expect(changeMemberRole(a.ctx, bMember.id, 'ANALYST')).rejects.toMatchObject({ status: 404 });
    const inv = await inviteMember(b.ctx, { email: 'guest@example.test', role: 'ANALYST' });
    await expect(revokeInvitation(a.ctx, inv.id)).rejects.toMatchObject({ status: 404 });
  });
});
