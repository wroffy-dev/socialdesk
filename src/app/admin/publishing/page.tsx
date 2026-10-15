import { listPublishingProblems } from '@/server/services/admin';
import { AdminTitle } from '@/components/admin/ui';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/posts/status-badge';
import { formatAgo } from '@/lib/time';

export const metadata = { title: 'Publishing failures' };
export const dynamic = 'force-dynamic';

export default async function AdminPublishing() {
  const data = await listPublishingProblems();
  return (
    <>
      <AdminTitle title="Publishing failures" description="Failed and unverified posts across all workspaces (latest 100)." />
      {data.topErrors.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
          <span className="text-muted">Top errors (7 days):</span>
          {data.topErrors.map((e) => (
            <code key={e.code} className="rounded bg-subtle px-2 py-0.5">
              {e.code} × {e.count}
            </code>
          ))}
        </div>
      )}
      <Table>
        <THead>
          <TR>
            <TH>Workspace</TH>
            <TH>Channel</TH>
            <TH>Status</TH>
            <TH>Error</TH>
            <TH>Attempts</TH>
            <TH>When</TH>
          </TR>
        </THead>
        <TBody>
          {data.items.length === 0 && (
            <TR>
              <TD colSpan={6} className="py-8 text-center text-muted">
                No failures. 🎉
              </TD>
            </TR>
          )}
          {data.items.map((v) => (
            <TR key={v.id}>
              <TD>{v.workspace.name}</TD>
              <TD>
                {v.socialAccount.name} <span className="text-xs text-muted">{v.platform.toLowerCase()}</span>
              </TD>
              <TD>
                <StatusBadge status={v.status} />
              </TD>
              <TD className="max-w-[360px] text-[13px]">
                {v.lastError}
                {v.lastErrorCode && <code className="ml-1 text-xs text-muted">{v.lastErrorCode}</code>}
              </TD>
              <TD>{v.attemptCount}</TD>
              <TD className="text-muted">{formatAgo(v.updatedAt)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </>
  );
}
