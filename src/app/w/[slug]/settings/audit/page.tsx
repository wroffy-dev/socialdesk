import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { NoAccess } from '@/components/no-access';
import { AuditLog } from '@/components/settings/audit-log';

export const metadata = { title: 'Audit log' };

export default async function AuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireWorkspacePage(slug);
  if (!hasPermission(ctx, 'audit.view')) return <NoAccess backHref={`/w/${slug}/settings`} />;
  return <AuditLog endpoint={`/api/w/${ctx.workspace.id}/audit`} />;
}
