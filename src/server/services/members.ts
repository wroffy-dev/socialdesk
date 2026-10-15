import { z } from 'zod';
import { db } from '../db';
import { env } from '../env';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { hashToken, randomToken } from '../crypto';
import { layout, sendMail } from '../mail';
import { assertCan, type WorkspaceCtx } from '../auth/ctx';
import { assignableRoles, ROLE_LABEL, ROLES, type Role } from '@/lib/permissions';
import { assertWithinLimit, getWorkspacePlan } from './entitlements';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(254),
  role: z.enum(ROLES),
});

export async function listMembers(ctx: WorkspaceCtx) {
  assertCan(ctx, 'members.view');
  const [members, invitations] = await Promise.all([
    db.workspaceMember.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true, image: true } } },
    }),
    db.invitation.findMany({
      where: { workspaceId: ctx.workspace.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true, invitedBy: { select: { name: true, email: true } } },
    }),
  ]);
  return {
    members,
    invitations: invitations.map((i) => ({ ...i, expired: i.expiresAt < new Date() })),
  };
}

/** Members plus pending (unexpired) invitations count toward the plan's seat limit. */
async function seatsUsed(workspaceId: string) {
  const [members, pending] = await Promise.all([
    db.workspaceMember.count({ where: { workspaceId } }),
    db.invitation.count({ where: { workspaceId, status: 'PENDING', expiresAt: { gt: new Date() } } }),
  ]);
  return members + pending;
}

export async function inviteMember(ctx: WorkspaceCtx, input: z.infer<typeof inviteSchema>) {
  assertCan(ctx, 'members.manage');
  if (!ctx.user.emailVerified) throw forbidden('Verify your email address before inviting teammates.');
  const { email, role } = inviteSchema.parse(input);
  if (!assignableRoles(ctx.role).includes(role)) throw forbidden(`You can't invite someone as ${ROLE_LABEL[role]}.`);

  const existingMember = await db.workspaceMember.findFirst({ where: { workspaceId: ctx.workspace.id, user: { email } } });
  if (existingMember) throw conflict('That person is already a member of this workspace.');

  const plan = await getWorkspacePlan(ctx.workspace.id);
  const pendingSame = await db.invitation.findFirst({ where: { workspaceId: ctx.workspace.id, email, status: 'PENDING' } });
  assertWithinLimit(plan, 'team_members', await seatsUsed(ctx.workspace.id), pendingSame ? 0 : 1);

  const token = randomToken();
  const invitation = await db.$transaction(async (tx) => {
    if (pendingSame) await tx.invitation.update({ where: { id: pendingSame.id }, data: { status: 'REVOKED' } });
    return tx.invitation.create({
      data: {
        workspaceId: ctx.workspace.id,
        email,
        role,
        tokenHash: hashToken(token),
        invitedById: ctx.user.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });
  });

  const url = `${env().APP_URL}/invite/${token}`;
  const inviter = ctx.user.name ?? ctx.user.email;
  await sendMail({
    to: email,
    subject: `${inviter} invited you to ${ctx.workspace.name} on SocialDesk`,
    text: `${inviter} invited you to join the "${ctx.workspace.name}" workspace as ${ROLE_LABEL[role]}.\n\nAccept the invitation:\n${url}\n\nThis invitation expires in 7 days.`,
    html: layout({
      heading: `Join ${ctx.workspace.name}`,
      body: `${inviter} invited you to join the "${ctx.workspace.name}" workspace on SocialDesk as ${ROLE_LABEL[role]}. This invitation expires in 7 days.`,
      actionLabel: 'Accept invitation',
      actionUrl: url,
    }),
  });
  await audit({ action: 'member.invited', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'invitation', targetId: invitation.id, metadata: { email, role } });
  return invitation;
}

export async function revokeInvitation(ctx: WorkspaceCtx, invitationId: string) {
  assertCan(ctx, 'members.manage');
  const res = await db.invitation.updateMany({
    where: { id: invitationId, workspaceId: ctx.workspace.id, status: 'PENDING' },
    data: { status: 'REVOKED' },
  });
  if (res.count === 0) throw notFound('Invitation');
  await audit({ action: 'member.invitation_revoked', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'invitation', targetId: invitationId });
}

export async function resendInvitation(ctx: WorkspaceCtx, invitationId: string) {
  assertCan(ctx, 'members.manage');
  const inv = await db.invitation.findFirst({ where: { id: invitationId, workspaceId: ctx.workspace.id, status: 'PENDING' } });
  if (!inv) throw notFound('Invitation');
  return inviteMember(ctx, { email: inv.email, role: inv.role });
}

/** Looks up an invitation by its secret token for the accept page. */
export async function getInvitationByToken(token: string) {
  const inv = await db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, email: true, role: true, status: true, expiresAt: true, workspace: { select: { id: true, name: true, slug: true } }, invitedBy: { select: { name: true, email: true } } },
  });
  if (!inv) return null;
  return { ...inv, usable: inv.status === 'PENDING' && inv.expiresAt > new Date() };
}

export async function acceptInvitation(user: { id: string; email: string }, token: string) {
  const inv = await db.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!inv || inv.status !== 'PENDING' || inv.expiresAt < new Date()) throw badRequest('This invitation is invalid or has expired.');
  if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
    throw forbidden(`This invitation was sent to ${inv.email}. Sign in with that email to accept it.`);
  }
  const workspace = await db.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({ where: { id: inv.id, status: 'PENDING' }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
    if (claimed.count !== 1) throw badRequest('This invitation has already been used.');
    await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId: user.id } },
      create: { workspaceId: inv.workspaceId, userId: user.id, role: inv.role },
      update: {},
    });
    await tx.notificationPreference.upsert({
      where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId: user.id } },
      create: { workspaceId: inv.workspaceId, userId: user.id },
      update: {},
    });
    // The invite link arrived at this address, so it is verified.
    await tx.user.updateMany({ where: { id: user.id, emailVerified: null }, data: { emailVerified: new Date() } });
    return tx.workspace.findUniqueOrThrow({ where: { id: inv.workspaceId }, select: { slug: true, id: true } });
  });
  await audit({ action: 'member.joined', actorId: user.id, workspaceId: inv.workspaceId, targetType: 'invitation', targetId: inv.id });
  return workspace;
}

async function ownerCount(workspaceId: string) {
  return db.workspaceMember.count({ where: { workspaceId, role: 'OWNER' } });
}

export async function changeMemberRole(ctx: WorkspaceCtx, memberId: string, role: Role) {
  assertCan(ctx, 'members.manage');
  const member = await db.workspaceMember.findFirst({ where: { id: memberId, workspaceId: ctx.workspace.id } });
  if (!member) throw notFound('Member');
  if (member.role === role) return member;
  const allowed = assignableRoles(ctx.role);
  if (!allowed.includes(role) || (member.role === 'OWNER' && ctx.role !== 'OWNER')) {
    throw forbidden("You can't make that role change.");
  }
  if (member.role === 'OWNER' && (await ownerCount(ctx.workspace.id)) <= 1) {
    throw badRequest('A workspace needs at least one owner. Make someone else an owner first.');
  }
  const updated = await db.workspaceMember.update({ where: { id: member.id }, data: { role } });
  await audit({ action: 'member.role_changed', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'member', targetId: member.userId, metadata: { from: member.role, to: role } });
  return updated;
}

export async function removeMember(ctx: WorkspaceCtx, memberId: string) {
  const member = await db.workspaceMember.findFirst({ where: { id: memberId, workspaceId: ctx.workspace.id } });
  if (!member) throw notFound('Member');
  const leavingSelf = member.userId === ctx.user.id;
  if (!leavingSelf) {
    assertCan(ctx, 'members.manage');
    if (member.role === 'OWNER' && ctx.role !== 'OWNER') throw forbidden('Only an owner can remove another owner.');
  }
  if (member.role === 'OWNER' && (await ownerCount(ctx.workspace.id)) <= 1) {
    throw badRequest('A workspace needs at least one owner. Transfer ownership before leaving.');
  }
  await db.workspaceMember.delete({ where: { id: member.id } });
  await audit({ action: leavingSelf ? 'member.left' : 'member.removed', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'member', targetId: member.userId });
}
