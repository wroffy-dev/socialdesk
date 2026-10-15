import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { db } from '@/server/db';
import { GeneralSettings } from '@/components/settings/general-settings';

export const metadata = { title: 'General settings' };

export default async function GeneralPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireWorkspacePage(slug);
  const member = await db.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: ctx.user.id } } });
  return (
    <GeneralSettings
      workspace={{ id: ctx.workspace.id, slug, name: ctx.workspace.name, timezone: ctx.workspace.timezone, logoUrl: ctx.workspace.logoUrl }}
      memberId={member.id}
      canEdit={hasPermission(ctx, 'workspace.update')}
      canDelete={hasPermission(ctx, 'workspace.delete')}
    />
  );
}
