import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { db } from '@/server/db';
import { listTags } from '@/server/services/tags';
import { PublishHeader } from '@/components/publish/publish-header';
import { PublishCalendar } from '@/components/publish/calendar';

export const metadata = { title: 'Publish' };

export default async function PublishCalendarPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ channel?: string }> }) {
  const { slug } = await params;
  const { channel } = await searchParams;
  const ctx = await requireWorkspacePage(slug);
  const [channels, tags] = await Promise.all([
    db.socialAccount.findMany({
      where: { workspaceId: ctx.workspace.id, status: { not: 'DISCONNECTED' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, username: true, avatarUrl: true, platform: true },
    }),
    listTags(ctx),
  ]);
  return (
    <>
      <PublishHeader slug={slug} active="calendar" canCreate={hasPermission(ctx, 'posts.edit')} />
      <PublishCalendar
        workspace={{ id: ctx.workspace.id, slug, timezone: ctx.workspace.timezone }}
        channels={channels}
        tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        canPublish={hasPermission(ctx, 'posts.publish')}
        canCreate={hasPermission(ctx, 'posts.edit')}
        initialChannel={channel ?? null}
      />
    </>
  );
}
