import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { getComposerData } from '@/server/services/composer';
import { Composer } from '@/components/composer/composer';
import { NoAccess } from '@/components/no-access';
import { AppError } from '@/server/errors';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Edit post' };

export default async function EditPostPage({ params }: { params: Promise<{ slug: string; postId: string }> }) {
  const { slug, postId } = await params;
  const ctx = await requireWorkspacePage(slug);
  if (!hasPermission(ctx, 'posts.edit')) return <NoAccess backHref={`/w/${slug}/publish/posts/${postId}`} />;
  const data = await getComposerData(ctx, postId).catch((err) => {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  });
  return <Composer {...data} preselectChannels={[]} presetProject={null} presetDate={null} defaultMode={null} />;
}
