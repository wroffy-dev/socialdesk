import Link from 'next/link';
import { Lightbulb, Plus } from 'lucide-react';
import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { listPosts } from '@/server/services/posts';
import { PageBody, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PlatformIcon } from '@/components/platform-icon';
import { MediaThumb } from '@/components/media/media-thumb';
import { NoAccess } from '@/components/no-access';
import { formatAgo } from '@/lib/time';

export const metadata = { title: 'Create' };

export default async function CreatePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tag?: string }> }) {
  const { slug } = await params;
  const { tag } = await searchParams;
  const ctx = await requireWorkspacePage(slug);
  if (!hasPermission(ctx, 'posts.edit')) return <NoAccess backHref={`/w/${slug}/home`} />;
  const drafts = await listPosts(ctx, { tab: 'drafts', pageSize: 100, tags: tag });
  const allTags = [...new Map(drafts.items.flatMap((d) => d.tags).map((t) => [t.id, t])).values()];
  const base = `/w/${slug}`;

  return (
    <>
      <PageHeader
        icon={<Lightbulb />}
        title="Create"
        description="Drafts in progress. Pick one up, or start something new."
        actions={
          <Button asChild variant="primary">
            <Link href={`${base}/compose`}>
              <Plus /> New post
            </Link>
          </Button>
        }
      />
      <PageBody>
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
            <span className="text-muted">Tags:</span>
            <Link href={`${base}/create`} className={`rounded-full border px-2.5 py-0.5 ${!tag ? 'border-fg bg-subtle' : 'border-line text-muted hover:text-fg'}`}>
              All
            </Link>
            {allTags.map((t) => (
              <Link
                key={t.id}
                href={`${base}/create?tag=${t.id}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${tag === t.id ? 'border-fg bg-subtle' : 'border-line text-muted hover:text-fg'}`}
              >
                <span className="size-2 rounded-full" style={{ background: t.color }} />
                {t.name}
              </Link>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <Link
            href={`${base}/compose`}
            className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line-strong text-muted transition-colors hover:border-fg/40 hover:text-fg"
          >
            <Plus className="size-6" />
            <span className="font-medium">New post</span>
          </Link>
          {drafts.items.map((d) => (
            <Link key={d.id} href={`${base}/compose/${d.id}`} className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-line-strong">
              {d.thumb && <MediaThumb media={d.thumb} className="h-40 w-full" rounded="none" />}
              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="line-clamp-4 text-[13px] leading-relaxed">{d.caption || <span className="italic text-muted">No text yet</span>}</p>
                <div className="mt-auto flex items-center gap-1.5">
                  {d.versions.map((v) => (
                    <PlatformIcon key={v.id} platform={v.platform} size={16} />
                  ))}
                  {d.tags.map((t) => (
                    <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-subtle px-1.5 text-2xs text-muted">
                      <span className="size-1.5 rounded-full" style={{ background: t.color }} />
                      {t.name}
                    </span>
                  ))}
                  <span className="ml-auto text-xs text-faint">{formatAgo(d.updatedAt)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        {drafts.items.length === 0 && <p className="text-center text-[13px] text-muted">No drafts{tag ? ' with this tag' : ''} yet.</p>}
      </PageBody>
    </>
  );
}
