import { getOverview } from '@/server/services/admin';
import { AdminTitle, StatCard } from '@/components/admin/ui';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatAgo } from '@/lib/time';

export const metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

export default async function AdminOverview() {
  const o = await getOverview();
  const healthyWorkers = o.workers.filter((w) => w.healthy).length;
  return (
    <>
      <AdminTitle title="Platform overview" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Users" value={`${o.users.total} (+${o.users.newThisWeek} this week)`} />
        <StatCard label="Workspaces" value={`${o.workspaces.total}${o.workspaces.suspended ? ` · ${o.workspaces.suspended} suspended` : ''}`} />
        <StatCard label="Connected channels" value={o.channels.connected} />
        <StatCard label="Channels needing attention" value={o.channels.needsAttention} tone={o.channels.needsAttention ? 'warning' : undefined} />
        <StatCard label="Published (24h / 7d)" value={`${o.publishing.published24h} / ${o.publishing.published7d}`} tone="ok" />
        <StatCard label="Scheduled" value={o.publishing.scheduled} />
        <StatCard label="Failed (24h)" value={o.publishing.failed24h} tone={o.publishing.failed24h ? 'danger' : undefined} />
        <StatCard label="Needs verification" value={o.publishing.needsVerification} tone={o.publishing.needsVerification ? 'warning' : undefined} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="section-title mb-3">Workers</h2>
          {o.workers.length === 0 ? (
            <p className="text-[13px] text-danger">No worker heartbeat. Scheduled posts will not publish until a worker is running.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-[13px]">
              {o.workers.map((w) => (
                <li key={w.id} className="flex items-center gap-2">
                  <Badge variant={w.healthy ? 'success' : 'danger'}>{w.healthy ? 'Healthy' : 'Stale'}</Badge>
                  <span className="truncate">{w.hostname} (pid {w.pid})</span>
                  <span className="ml-auto text-xs text-muted">beat {formatAgo(w.lastBeatAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">
            {healthyWorkers} healthy · {o.failedJobs24h} failed jobs in 24h
          </p>
        </Card>
        <Card className="p-4">
          <h2 className="section-title mb-3">Queues</h2>
          <ul className="flex flex-col gap-2 text-[13px]">
            {Object.entries(o.queues).map(([name, c]) => (
              <li key={name} className="flex flex-wrap gap-x-3">
                <span className="w-24 font-medium">{name}</span>
                {'error' in c ? (
                  <span className="text-danger">{String(c.error)}</span>
                ) : (
                  Object.entries(c).map(([k, v]) => (
                    <span key={k} className="text-muted">
                      {k}: <span className="tabular-nums text-fg">{v}</span>
                    </span>
                  ))
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <h2 className="section-title mb-3">Subscriptions by plan</h2>
          <ul className="text-[13px]">
            {o.subscriptions.map((s) => (
              <li key={s.plan} className="flex justify-between py-0.5">
                <span>{s.plan}</span>
                <span className="tabular-nums">{s.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
