import { notFound } from 'next/navigation';
import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { getPost } from '@/server/services/posts';
import { AppError } from '@/server/errors';
import { PostDetail } from '@/components/publish/post-detail';

export const metadata = { title: 'Post details' };

export default async function PostDetailPage({ params }: { params: Promise<{ slug: string; postId: string }> }) {
  const { slug, postId } = await params;
  const ctx = await requireWorkspacePage(slug);
  const post = await getPost(ctx, postId).catch((err) => {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  });
  return (
    <PostDetail
      post={post}
      workspace={{ id: ctx.workspace.id, slug, timezone: ctx.workspace.timezone }}
      canEdit={hasPermission(ctx, 'posts.edit')}
      canPublish={hasPermission(ctx, 'posts.publish')}
    />
  );
}
