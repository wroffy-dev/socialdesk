'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, Download, ExternalLink, Info, Layers, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ChannelAvatar, PlatformIcon } from '@/components/platform-icon';
import { api, errorMessage } from '@/lib/api-client';
import { formatAgo } from '@/lib/time';
import { cn, formatNumber } from '@/lib/utils';
import type { Insights } from '@/server/services/insights';

// Chart tokens (single-series charts use categorical slot 1 of the validated reference palette).
const SERIES = '#2a78d6';
const GRID = '#e7e5e0';
const AXIS_TEXT = '#76726a';

const RANGES = [
  ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'],
  ['mtd', 'Month to date'],
  ['custom', 'Custom'],
] as const;
type RangeKey = (typeof RANGES)[number][0];

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function InsightsView({
  workspace,
  projects,
  channels,
}: {
  workspace: { id: string; slug: string };
  projects: { id: string; name: string; color: string }[];
  channels: { id: string; projectId: string; name: string; username: string | null; platform: 'INSTAGRAM' | 'FACEBOOK'; avatarUrl: string | null }[];
}) {
  const [range, setRange] = useState<RangeKey>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams({ range });
    if (range === 'custom') {
      if (from) p.set('from', from);
      if (to) p.set('to', to);
    }
    if (selected.length) p.set('channels', selected.join(','));
    return p.toString();
  }, [range, from, to, selected]);

  useEffect(() => {
    if (range === 'custom' && (!from || !to)) return;
    let cancelled = false;
    setLoading(true);
    api<Insights>(`/api/w/${workspace.id}/insights?${query}`)
      .then((d) => !cancelled && setData(d))
      .catch((err) => toast.error(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [workspace.id, query, range, from, to]);

  if (channels.length === 0) {
    return (
      <div className="px-5 pb-10 sm:px-8">
        <EmptyState icon={<Layers />} title="No channels yet" description="Connect a channel to one of your projects to start collecting insights." action={<Button asChild variant="primary"><Link href={`/w/${workspace.slug}/channels`}>Go to projects</Link></Button>} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-5 pb-10 sm:px-8">
      {/* Filters: one row above the charts */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Date range">
          {RANGES.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              aria-pressed={range === k}
              className={cn('rounded-md px-3 py-1.5 text-[13px]', range === k ? 'bg-accent-soft font-medium text-accent-ink' : 'text-fg/80 hover:bg-subtle')}
            >
              {label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex items-center gap-1.5 text-[13px]">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[150px]" aria-label="From" />
            <span className="text-muted">to</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[150px]" aria-label="To" />
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className={cn(selected.length && 'border-accent-ink bg-accent-soft text-accent-ink')}>
              <Layers /> {selected.length ? `${selected.length} channel${selected.length > 1 ? 's' : ''}` : 'All channels'} <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64">
            {projects.length > 1 && (
              <>
                <DropdownMenuLabel>Projects</DropdownMenuLabel>
                {projects.map((p) => {
                  const ids = channels.filter((c) => c.projectId === p.id).map((c) => c.id);
                  return (
                    <DropdownMenuItem key={p.id} disabled={ids.length === 0} onSelect={() => setSelected(ids)}>
                      <span className="size-2.5 rounded-full" style={{ background: p.color }} /> {p.name}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuItem onSelect={() => setSelected([])}>All projects</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Channels</DropdownMenuLabel>
              </>
            )}
            {channels.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                checked={selected.includes(c.id)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(on) => setSelected((cur) => (on ? [...cur, c.id] : cur.filter((x) => x !== c.id)))}
              >
                <ChannelAvatar name={c.name} avatarUrl={c.avatarUrl} platform={c.platform} size={20} /> {c.username ?? c.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto">
          {data &&
            (data.canExport ? (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/w/${workspace.id}/insights/export?${query}`} download>
                  <Download /> Export CSV
                </a>
              </Button>
            ) : (
              <Tooltip content="CSV export is available on paid plans.">
                <Button variant="outline" size="sm" disabled>
                  <Lock /> Export CSV
                </Button>
              </Tooltip>
            ))}
        </div>
      </div>

      {!data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className={cn('flex flex-col gap-5 transition-opacity', loading && 'opacity-60')}>
          {data.range.clamped && (
            <Alert variant="info">
              Your plan includes {data.range.maxDays} days of analytics history, so the range starts on {shortDate(data.range.from)}.
            </Alert>
          )}
          {!data.hasAnyMetrics && (
            <Alert variant="info" title="No platform metrics yet">
              Post counts below come from SocialDesk. Follower, reach and engagement numbers appear after the first analytics sync for channels that allow it (see the channel table for details).
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Posts published" value={data.totals.postsPublished} />
            <Stat label="Followers" value={data.totals.followers} delta={data.totals.followerChange} hint="Latest follower counts summed across channels; change since the start of the range." />
            <Stat label="Reach" value={data.totals.reach} hint="Sum of daily account reach where the platform reports it." />
            <Stat label="Reactions & comments" value={data.totals.likes === null && data.totals.comments === null ? null : (data.totals.likes ?? 0) + (data.totals.comments ?? 0)} hint="On posts published in this range." />
            <Stat label="Engagement rate" value={data.totals.engagementRate} suffix="%" hint="Interactions ÷ post reach, for posts where both are reported." />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Posts published per day">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={{ stroke: GRID }} tickLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} />
                  <ChartTooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<ChartTip metric="Posts" />} />
                  <Bar dataKey="published" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Daily reach" unavailable={data.series.every((s) => s.reach === null) ? 'Reach is not available for the selected channels yet.' : undefined}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={{ stroke: GRID }} tickLine={false} minTickGap={24} />
                  <YAxis tickFormatter={(v) => formatNumber(v)} tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} />
                  <ChartTooltip cursor={{ stroke: AXIS_TEXT, strokeWidth: 1 }} content={<ChartTip metric="Reach" />} />
                  <Area type="monotone" dataKey="reach" stroke={SERIES} strokeWidth={2} fill={SERIES} fillOpacity={0.1} connectNulls activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <section>
            <h2 className="section-title mb-2">By channel</h2>
            <Card>
              <Table>
                <THead>
                  <TR className="bg-subtle">
                    <TH>Channel</TH>
                    <TH className="text-right">Posts</TH>
                    <TH className="text-right">Followers</TH>
                    <TH className="text-right">Change</TH>
                    <TH className="text-right">Reach</TH>
                    <TH className="text-right">Reactions</TH>
                    <TH className="text-right">Comments</TH>
                    <TH className="text-right">Eng. rate</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.channels.map((c) => (
                    <TR key={c.id}>
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <ChannelAvatar name={c.name} avatarUrl={c.avatarUrl} platform={c.platform} size={26} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{c.username ?? c.name}</p>
                            {c.notes.length > 0 && <p className="truncate text-xs text-muted">{c.notes.join(' · ')}</p>}
                          </div>
                        </div>
                      </TD>
                      <Num v={c.posts} />
                      <Num v={c.followers} />
                      <TD className="text-right tabular-nums">
                        {c.followerChange === null ? <NA /> : <span className={c.followerChange >= 0 ? 'text-accent-ink' : 'text-danger'}>{c.followerChange > 0 ? '+' : ''}{formatNumber(c.followerChange)}</span>}
                      </TD>
                      <Num v={c.reach} />
                      <Num v={c.likes} />
                      <Num v={c.comments} />
                      <Num v={c.engagementRate} suffix="%" />
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          </section>

          <section>
            <h2 className="section-title mb-2">Post performance</h2>
            {data.posts.length === 0 ? (
              <EmptyState title="No posts published in this range" />
            ) : (
              <Card>
                <Table>
                  <THead>
                    <TR className="bg-subtle">
                      <TH>Post</TH>
                      <TH>Published</TH>
                      <TH className="text-right">Reactions</TH>
                      <TH className="text-right">Comments</TH>
                      <TH className="text-right">Shares</TH>
                      <TH className="text-right">Saves</TH>
                      <TH className="text-right">Reach</TH>
                      <TH className="text-right">Eng. rate</TH>
                      <TH />
                    </TR>
                  </THead>
                  <TBody>
                    {data.posts.slice(0, 50).map((p) => (
                      <TR key={p.id}>
                        <TD className="max-w-[320px]">
                          <div className="flex items-center gap-2">
                            <PlatformIcon platform={p.platform} size={16} />
                            <Link href={`/w/${workspace.slug}/publish/posts/${p.postId}`} className="truncate text-[13px] hover:underline">
                              {p.caption || 'Media post'}
                            </Link>
                          </div>
                          <p className="ml-6 text-xs text-muted">{p.accountName}{p.metricsFetchedAt ? '' : ' · metrics not synced yet'}</p>
                        </TD>
                        <TD className="whitespace-nowrap text-[13px] text-muted">{formatAgo(p.publishedAt)}</TD>
                        <Num v={p.likes} />
                        <Num v={p.comments} />
                        <Num v={p.shares} />
                        <Num v={p.saves} />
                        <Num v={p.reach} />
                        <Num v={p.engagementRate} suffix="%" />
                        <TD>
                          {p.externalUrl && (
                            <a href={p.externalUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-fg" aria-label="View on platform">
                              <ExternalLink className="size-4" />
                            </a>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
            )}
          </section>
          <p className="text-xs text-faint">— means the platform does not report that metric for this channel or post. Values are never estimated.</p>
        </div>
      )}
    </div>
  );
}

function NA() {
  return <span className="text-faint" title="Not available">—</span>;
}

function Num({ v, suffix }: { v: number | null; suffix?: string }) {
  return <TD className="text-right tabular-nums">{v === null ? <NA /> : `${formatNumber(v)}${suffix ?? ''}`}</TD>;
}

function Stat({ label, value, delta, suffix, hint }: { label: string; value: number | null; delta?: number | null; suffix?: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-subtle p-4">
      <div className="flex items-center justify-between text-[13px] text-muted">
        {label}
        {hint && (
          <Tooltip content={hint}>
            <button aria-label={`About ${label}`} className="text-faint hover:text-muted">
              <Info className="size-3.5" />
            </button>
          </Tooltip>
        )}
      </div>
      {value === null ? (
        <span className="text-[13px] text-faint">Not available</span>
      ) : (
        <span className="text-2xl font-semibold tabular-nums">
          {formatNumber(value)}
          {suffix}
        </span>
      )}
      {delta !== undefined && delta !== null && (
        <span className={cn('text-xs', delta >= 0 ? 'text-accent-ink' : 'text-danger')}>
          {delta > 0 ? '+' : ''}
          {formatNumber(delta)} in range
        </span>
      )}
    </div>
  );
}

function ChartCard({ title, unavailable, children }: { title: string; unavailable?: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-[14px] font-semibold">{title}</h3>
      {unavailable ? <div className="flex h-[220px] items-center justify-center rounded-md bg-subtle px-6 text-center text-[13px] text-muted">{unavailable}</div> : children}
    </Card>
  );
}

function ChartTip({ active, payload, label, metric }: { active?: boolean; payload?: { value: number | null }[]; label?: string; metric: string }) {
  if (!active || !payload?.length) return null;
  const v = payload[0]!.value;
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-pop">
      <p className="text-muted">{label ? shortDate(String(label)) : ''}</p>
      <p className="font-medium text-fg">
        {metric}: {v === null || v === undefined ? 'not available' : formatNumber(v)}
      </p>
    </div>
  );
}
