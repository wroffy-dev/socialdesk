import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ExternalLink, FileText, Info, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { requireWorkspacePage } from '@/server/auth/workspace';
import { getDashboard, type Dashboard } from '@/server/services/dashboard';
import { hasPermission } from '@/server/auth/ctx';
import { PageBody, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
import { ChannelAvatar, PlatformIcon } from '@/components/platform-icon';
import { MediaThumb } from '@/components/media/media-thumb';
import { StatusBadge } from '@/components/posts/status-badge';
import { OnboardingChecklist } from '@/components/home/onboarding-checklist';
import { formatAgo, formatInTz, formatUpcoming, greeting } from '@/lib/time';
import { cn, formatNumber, pluralize } from '@/lib/utils';

export const metadata = { title: 'Home' };

export default async function HomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireWorkspacePage(slug);
  const data = await getDashboard(ctx);
  const tz = ctx.workspace.timezone;
  const base = `/w/${slug}`;
  const canCreate = hasPermission(ctx, 'posts.edit');
  const firstName = ctx.user.name?.split(' ')[0] ?? 'there';
  const weekLabel = `${formatInTz(data.weekStart, tz, { month: 'short', day: 'numeric' })} to ${formatInTz(new Date(), tz, { month: 'short', day: 'numeric' })}`;

  return (
    <>
      <PageHeader
        icon={<span className="text-xl leading-none">👋</span>}
        title={`${greeting(tz)}, ${firstName}!`}
        description={formatInTz(new Date(), tz, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        actions={
          canCreate && (
            <Button asChild variant="primary">
              <Link href={`${base}/compose`}>
                <Plus /> New post
              </Link>
            </Button>
          )
        }
      />
      <PageBody>
        {data.isNew && (
          <OnboardingChecklist
            emailVerified={!!ctx.user.emailVerified}
            hasChannels={data.channels.length > 0}
            hasPosts={data.postCount > 0}
            canManageChannels={hasPermission(ctx, 'channels.manage')}
            canCreate={canCreate}
            base={base}
          />
        )}

        <StatusStrip counts={data.counts} base={base} />

        <section>
          <h2 className="mb-3 flex items-baseline gap-1.5 text-[15px] font-semibold">
            Weekly Pulse <span className="text-[13px] font-normal text-muted">· {weekLabel} · Compared to previous week</span>
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <PulseCard label="Posts published" hint="Channel posts published this week." value={data.pulse.posts.value} previous={data.pulse.posts.previous} />
            <PulseCard
              label="Total followers"
              hint="Sum of the latest follower counts reported by your connected channels."
              value={data.pulse.followers?.value ?? null}
              previous={data.pulse.followers?.previous ?? null}
              unavailable={data.channels.length === 0 ? 'Connect a channel to see followers.' : 'Available after the first analytics sync.'}
            />
            <PulseCard label="Comments" hint="Comments received on your posts this week." value={data.pulse.comments.value} previous={data.pulse.comments.previous} />
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">
              Latest Drafts <span className="font-normal text-muted">· {data.counts.drafts} saved</span>
            </h2>
            {data.counts.drafts > 0 && (
              <Link href={`${base}/create`} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
                All drafts <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
          {data.drafts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line-strong bg-subtle px-4 py-6 text-center text-[13px] text-muted">
              No drafts yet. {canCreate && <Link className="font-medium text-fg underline-offset-2 hover:underline" href={`${base}/compose`}>Start one</Link>}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.drafts.slice(0, 3).map((d) => (
                <Link key={d.id} href={`${base}/compose/${d.id}`} className="group flex gap-3 rounded-lg border border-line p-3 transition-colors hover:border-line-strong hover:bg-subtle">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex gap-1">
                      {d.platforms.length === 0 && <span className="text-xs text-faint">No channel</span>}
                      {d.platforms.map((p) => (
                        <PlatformIcon key={p} platform={p} size={18} />
                      ))}
                    </div>
                    <p className="line-clamp-3 text-[13px] leading-relaxed">{d.caption || <span className="italic text-muted">No text</span>}</p>
                    <p className="mt-auto text-xs text-faint">Edited {formatAgo(d.updatedAt)}</p>
                  </div>
                  {d.thumb && <MediaThumb media={d.thumb} className="size-16 shrink-0" />}
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <UpNext data={data} tz={tz} base={base} />
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">
                Comments <span className="font-normal text-muted">· {data.comments.unanswered.length === 3 ? '3+' : data.comments.unanswered.length} unanswered</span>
              </h2>
              <Link href={`${base}/community`} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
                Open inbox <ArrowRight className="size-3.5" />
              </Link>
            </div>
            {data.comments.unanswered.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-muted">You&apos;re all caught up.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {data.comments.unanswered.map((c) => (
                  <li key={c.id} className="flex gap-2.5 py-2.5">
                    <PlatformIcon platform={c.socialAccount.platform} size={18} className="mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[13px]">
                        <span className="font-medium">{c.authorName}</span> <span className="text-xs text-faint">{formatAgo(c.postedAt)}</span>
                      </p>
                      <p className="line-clamp-2 text-[13px] text-muted">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="p-4">
          <h2 className="mb-3 text-[15px] font-semibold">Recent publishing activity</h2>
          {data.activity.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted">Nothing has been published yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data.activity.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  {a.status === 'PUBLISHED' ? (
                    <CheckCircle2 className="size-4 shrink-0 text-accent-ink" />
                  ) : (
                    <AlertTriangle className="size-4 shrink-0 text-danger" />
                  )}
                  <PlatformIcon platform={a.platform} size={18} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px]">{a.caption || <span className="italic text-muted">Media post</span>}</p>
                    <p className="truncate text-xs text-muted">
                      {a.accountName} · {formatAgo(a.at)}
                      {a.status !== 'PUBLISHED' && a.error && <span className="text-danger"> · {a.error}</span>}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                  {a.externalUrl ? (
                    <a href={a.externalUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-fg" aria-label="View on platform">
                      <ExternalLink className="size-4" />
                    </a>
                  ) : (
                    <Link href={`${base}/publish/posts/${a.postId}`} className="text-muted hover:text-fg" aria-label="View details">
                      <ArrowRight className="size-4" />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}

function StatusStrip({ counts, base }: { counts: Dashboard['counts']; base: string }) {
  const items = [
    { label: 'Scheduled', value: counts.scheduled, href: `${base}/publish/posts?tab=scheduled`, icon: CalendarClock, tone: 'text-info' },
    { label: 'Published', value: counts.published, href: `${base}/publish/posts?tab=published`, icon: CheckCircle2, tone: 'text-accent-ink' },
    { label: 'Drafts', value: counts.drafts, href: `${base}/publish/posts?tab=drafts`, icon: FileText, tone: 'text-muted' },
    { label: 'Failed', value: counts.failed, href: `${base}/publish/posts?tab=failed`, icon: AlertTriangle, tone: counts.failed ? 'text-danger' : 'text-muted' },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
      {items.map((i) => (
        <Link key={i.label} href={i.href} className="flex items-center gap-3 bg-subtle px-4 py-3.5 transition-colors hover:bg-hover">
          <span className={cn('flex size-10 items-center justify-center rounded-full border-2 border-line-strong bg-surface text-base font-semibold tabular-nums', i.tone)}>
            {i.value}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] font-medium">
            <i.icon className={cn('size-4', i.tone)} /> {i.label}
          </span>
        </Link>
      ))}
    </div>
  );
}

function PulseCard({
  label,
  hint,
  value,
  previous,
  unavailable,
}: {
  label: string;
  hint: string;
  value: number | null;
  previous: number | null;
  unavailable?: string;
}) {
  const delta = value !== null && previous !== null ? value - previous : null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-subtle p-4">
      <div className="flex items-center justify-between text-[13px] text-muted">
        {label}
        <Tooltip content={hint}>
          <button aria-label={`About ${label}`} className="text-faint hover:text-muted">
            <Info className="size-4" />
          </button>
        </Tooltip>
      </div>
      {value === null ? (
        <p className="text-[13px] text-faint">{unavailable ?? 'Not available'}</p>
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{formatNumber(value)}</span>
          {delta !== null && delta !== 0 && (
            <span className={cn('inline-flex items-center gap-1 text-xs', delta > 0 ? 'text-accent-ink' : 'text-danger')}>
              {delta > 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
              {delta > 0 ? '+' : ''}
              {formatNumber(delta)} <span className="text-muted">vs last week</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function UpNext({ data, tz, base }: { data: Dashboard; tz: string; base: string }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">
          Up Next <span className="font-normal text-muted">· {pluralize(data.counts.scheduled, 'post')} scheduled</span>
        </h2>
        <Link href={`${base}/publish`} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
          Calendar <ArrowRight className="size-3.5" />
        </Link>
      </div>
      {data.upcoming.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted">Nothing scheduled. Plan your next post from the calendar.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {data.upcoming.map((u) => (
            <li key={u.id}>
              <Link href={`${base}/publish/posts/${u.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                <div className="flex -space-x-1.5">
                  {u.channels.slice(0, 3).map((c) => (
                    <ChannelAvatar key={c.id} name={c.name} avatarUrl={c.avatarUrl} platform={c.platform} size={24} />
                  ))}
                </div>
                <p className="min-w-0 flex-1 truncate text-[13px]">{u.caption || <span className="italic text-muted">Media post</span>}</p>
                <span className="shrink-0 text-xs text-muted">{formatUpcoming(u.scheduledAt, tz)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
