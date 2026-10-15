import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { getQueue } from '@/server/services/queue';
import { PublishHeader } from '@/components/publish/publish-header';
import { QueueManager } from '@/components/publish/queue-manager';

export const metadata = { title: 'Queue' };

export default async function QueuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireWorkspacePage(slug);
  const queue = await getQueue(ctx);
  return (
    <>
      <PublishHeader slug={slug} active="queue" canCreate={hasPermission(ctx, 'posts.edit')} />
      <QueueManager
        initial={queue}
        workspace={{ id: ctx.workspace.id, slug }}
        canManage={hasPermission(ctx, 'queue.manage')}
        canPublish={hasPermission(ctx, 'posts.publish')}
        canCreate={hasPermission(ctx, 'posts.edit')}
      />
    </>
  );
}
