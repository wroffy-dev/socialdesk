import { listFailedJobs, queueStats } from '@/server/services/admin';
import { db } from '@/server/db';
import { AdminTitle } from '@/components/admin/ui';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatAgo } from '@/lib/time';

export const metadata = { title: 'Background jobs' };
export const dynamic = 'force-dynamic';

export default async function AdminJobs() {
  const [queues, failed, workers] = await Promise.all([queueStats(), listFailedJobs(), db.workerHeartbeat.findMany({ orderBy: { lastBeatAt: 'desc' } })]);
  return (
    <>
      <AdminTitle title="Background jobs" description="Queue state comes from Redis; scheduled posts themselves live in PostgreSQL and are re-queued by the reconciler if Redis loses them." />
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(queues).map(([name, c]) => (
          <Card key={name} className="p-4">
            <h2 className="section-title mb-2">{name}</h2>
            {'error' in c ? (
              <p className="text-[13px] text-danger">Redis unavailable: {String(c.error)}</p>
            ) : (
              <dl className="grid grid-cols-3 gap-2 text-[13px]">
                {Object.entries(c).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
        ))}
      </div>
      <h2 className="section-title mb-2 mt-6">Workers</h2>
      <ul className="mb-6 text-[13px]">
        {workers.length === 0 && <li className="text-danger">No workers are running.</li>}
        {workers.map((w) => {
          const healthy = Date.now() - w.lastBeatAt.getTime() < 90_000;
          return (
            <li key={w.id} className="flex items-center gap-2 border-b border-line py-1.5">
              <Badge variant={healthy ? 'success' : 'danger'}>{healthy ? 'healthy' : 'stale'}</Badge>
              {w.hostname} · pid {w.pid} · started {formatAgo(w.startedAt)} · last beat {formatAgo(w.lastBeatAt)}
            </li>
          );
        })}
      </ul>
      <h2 className="section-title mb-2">Failed jobs (latest 100)</h2>
      {failed.length === 0 ? (
        <p className="text-[13px] text-muted">None.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {failed.map((f) => (
            <li key={f.id}>
              <details className="rounded-md border border-line p-2 text-[13px]">
                <summary className="cursor-pointer">
                  <strong>{f.queue}</strong> · {f.name} · {formatAgo(f.failedAt)} · {f.error.split('\n')[0]}
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted">{f.error}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
