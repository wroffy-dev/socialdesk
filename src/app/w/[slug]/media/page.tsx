import { ImageIcon } from 'lucide-react';
import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { uploadLimits } from '@/server/services/media';
import { PageHeader } from '@/components/page-header';
import { MediaLibrary } from '@/components/media/media-library';

export const metadata = { title: 'Media library' };

export default async function MediaPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ upload?: string }> }) {
  const { slug } = await params;
  const { upload } = await searchParams;
  const ctx = await requireWorkspacePage(slug);
  const limits = uploadLimits();
  return (
    <>
      <PageHeader icon={<ImageIcon />} title="Media library" description="Images and videos for your posts. Files are private to this workspace." />
      <MediaLibrary
        workspaceId={ctx.workspace.id}
        canUpload={hasPermission(ctx, 'media.upload')}
        canDelete={hasPermission(ctx, 'media.delete')}
        autoOpenUpload={upload === '1'}
        limits={{ imageMb: Math.round(limits.imageBytes / 1048576), videoMb: Math.round(limits.videoBytes / 1048576) }}
      />
    </>
  );
}
