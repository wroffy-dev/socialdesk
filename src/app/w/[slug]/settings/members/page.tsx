import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { listMembers } from '@/server/services/members';
import { getWorkspacePlan, limitOf } from '@/server/services/entitlements';
import { assignableRoles } from '@/lib/permissions';
import { MembersManager } from '@/components/settings/members-manager';

export const metadata = { title: 'Team members' };

export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireWorkspacePage(slug);
  const [data, plan] = await Promise.all([listMembers(ctx), getWorkspacePlan(ctx.workspace.id)]);
  return (
    <MembersManager
      workspaceId={ctx.workspace.id}
      currentUserId={ctx.user.id}
      currentRole={ctx.role}
      canManage={hasPermission(ctx, 'members.manage')}
      assignable={assignableRoles(ctx.role)}
      emailVerified={!!ctx.user.emailVerified}
      seatLimit={limitOf(plan, 'team_members')}
      planName={plan.planName}
      initial={{
        members: data.members.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
        invitations: data.invitations.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString(), createdAt: i.createdAt.toISOString() })),
      }}
    />
  );
}
