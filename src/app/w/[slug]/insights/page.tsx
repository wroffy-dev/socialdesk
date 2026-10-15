import { BarChart3 } from 'lucide-react';
import { requireWorkspacePage } from '@/server/auth/workspace';
import { db } from '@/server/db';
import { PageHeader } from '@/components/page-header';
import { InsightsView } from '@/components/insights/insights-view';

export const metadata = { title: 'Insights' };

export default async function InsightsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireWorkspacePage(slug);
  const channels = await db.socialAccount.findMany({
    where: { workspaceId: ctx.workspace.id, status: { not: 'DISCONNECTED' } },
    select: { id: true, name: true, username: true, platform: true, avatarUrl: true },
    orderBy: { createdAt: 'asc' },
  });
  return (
    <>
      <PageHeader icon={<BarChart3 />} title="Insights" description="Performance from the platforms' official APIs. Metrics a platform doesn't share are shown as unavailable." />
      <InsightsView workspace={{ id: ctx.workspace.id, slug }} channels={channels} />
    </>
  );
}
