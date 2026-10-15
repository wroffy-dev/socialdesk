import { Layers } from 'lucide-react';
import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { listChannels } from '@/server/services/channels';
import { PageHeader } from '@/components/page-header';
import { ChannelsManager } from '@/components/channels/channels-manager';

export const metadata = { title: 'Channels' };

export default async function ChannelsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; connected?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspacePage(slug);
  const data = await listChannels(ctx);
  return (
    <>
      <PageHeader icon={<Layers />} title="Channels" description="Social accounts connected to this workspace." />
      <ChannelsManager
        initial={data}
        workspace={{ id: ctx.workspace.id, slug }}
        canManage={hasPermission(ctx, 'channels.manage')}
        error={sp.error ?? null}
        connected={sp.connected ? Number(sp.connected) : null}
      />
    </>
  );
}
