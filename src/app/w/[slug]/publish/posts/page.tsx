import { Suspense } from 'react';
import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { db } from '@/server/db';
import { listTags } from '@/server/services/tags';
import { PublishHeader } from '@/components/publish/publish-header';
import { PostsList } from '@/components/publish/posts-list';

export const metadata = { title: 'Posts' };

export default async function PostsListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireWorkspacePage(slug);
  const [projects, channels, tags] = await Promise.all([
    db.project.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, name: true, color: true } }),
    db.socialAccount.findMany({
      where: { workspaceId: ctx.workspace.id, status: { not: 'DISCONNECTED' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, projectId: true, name: true, username: true, avatarUrl: true, platform: true },
    }),
    listTags(ctx),
  ]);
  return (
    <>
      <PublishHeader slug={slug} active="list" canCreate={hasPermission(ctx, 'posts.edit')} />
      <Suspense>
      <PostsList
        workspace={{ id: ctx.workspace.id, slug, timezone: ctx.workspace.timezone }}
        projects={projects}
        channels={channels}
        tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        canEdit={hasPermission(ctx, 'posts.edit')}
        canPublish={hasPermission(ctx, 'posts.publish')}
      />
      </Suspense>
    </>
  );
}
