import { listIntegrationHealth } from '@/server/services/admin';
import { env } from '@/server/env';
import { AdminTitle, StatCard } from '@/components/admin/ui';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatAgo } from '@/lib/time';

export const metadata = { title: 'Integration health' };
export const dynamic = 'force-dynamic';

export default async function AdminIntegrations() {
  const data = await listIntegrationHealth();
  const e = env();
  return (
    <>
      <AdminTitle title="Integration health" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Meta mode" value={e.META_MODE} tone={e.META_MODE === 'live' ? 'ok' : 'warning'} />
        <StatCard label="Graph API version" value={e.META_GRAPH_VERSION} />
        <StatCard label="Meta app configured" value={e.META_APP_ID ? 'Yes' : 'No'} tone={e.META_APP_ID ? 'ok' : 'warning'} />
        <StatCard label="Billing" value={e.BILLING_ENABLED ? 'Enabled' : 'Free beta'} />
      </div>
      <h2 className="section-title mb-2">Channels by mode</h2>
      <div className="mb-5 flex flex-wrap gap-2 text-[13px]">
        {data.modes.map((m) => (
          <Badge key={`${m.mode}-${m.platform}`}>
            {m.platform.toLowerCase()} · {m.mode.toLowerCase()}: {m.count}
          </Badge>
        ))}
      </div>
      <h2 className="section-title mb-2">Channels needing attention</h2>
      <Table>
        <THead>
          <TR>
            <TH>Workspace</TH>
            <TH>Channel</TH>
            <TH>Status</TH>
            <TH>Last error</TH>
            <TH>Checked</TH>
          </TR>
        </THead>
        <TBody>
          {data.accounts.length === 0 && (
            <TR>
              <TD colSpan={5} className="py-6 text-center text-muted">
                All channels healthy.
              </TD>
            </TR>
          )}
          {data.accounts.map((a) => (
            <TR key={a.id}>
              <TD>{a.workspace.name}</TD>
              <TD>
                {a.name} <span className="text-xs text-muted">{a.platform.toLowerCase()}</span>
              </TD>
              <TD>
                <Badge variant="danger">{a.status.toLowerCase().replace('_', ' ')}</Badge>
              </TD>
              <TD className="max-w-[360px] text-[13px]">{a.lastError}</TD>
              <TD className="text-muted">{a.lastCheckedAt ? formatAgo(a.lastCheckedAt) : '—'}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {data.syncErrors.length > 0 && (
        <>
          <h2 className="section-title mb-2 mt-6">Sync errors</h2>
          <ul className="text-[13px]">
            {data.syncErrors.map((s, i) => (
              <li key={i} className="border-b border-line py-1.5">
                <strong>{s.kind}</strong> · {s.socialAccount.workspace.name} / {s.socialAccount.name}: <span className="text-danger">{s.lastError}</span>{' '}
                <span className="text-muted">({formatAgo(s.updatedAt)})</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
