import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { getComposerData } from '@/server/services/composer';
import { Composer } from '@/components/composer/composer';
import { NoAccess } from '@/components/no-access';

export const metadata = { title: 'Create post' };

export default async function NewPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ channel?: string; project?: string; date?: string; mode?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspacePage(slug);
  if (!hasPermission(ctx, 'posts.edit')) return <NoAccess backHref={`/w/${slug}/home`} />;
  const data = await getComposerData(ctx, null);
  return (
    <Composer
      {...data}
      preselectChannels={sp.channel ? sp.channel.split(',') : []}
      presetProject={sp.project ?? null}
      presetDate={sp.date && !Number.isNaN(Date.parse(sp.date)) ? new Date(sp.date).toISOString() : null}
      defaultMode={sp.mode === 'queue' ? 'queue' : null}
    />
  );
}
