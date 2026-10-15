import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { getBilling } from '@/server/services/billing';
import { NoAccess } from '@/components/no-access';
import { BillingView } from '@/components/settings/billing-view';

export const metadata = { title: 'Billing & plan' };

export default async function BillingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireWorkspacePage(slug);
  if (!hasPermission(ctx, 'billing.view')) return <NoAccess backHref={`/w/${slug}/settings`} />;
  return <BillingView workspaceId={ctx.workspace.id} initial={await getBilling(ctx)} canManage={hasPermission(ctx, 'billing.manage')} />;
}
