import { db } from '@/server/db';
import { listWorkspaces } from '@/server/services/admin';
import { AdminTitle } from '@/components/admin/ui';
import { AdminAction, PlanSelect } from '@/components/admin/admin-action';
import { Pager, SearchForm } from '@/components/admin/search-form';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatAgo } from '@/lib/time';

export const metadata = { title: 'Workspaces' };

export default async function AdminWorkspaces({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q, page } = await searchParams;
  const [data, plans] = await Promise.all([listWorkspaces(q, Math.max(1, Number(page) || 1)), db.plan.findMany({ orderBy: { sortOrder: 'asc' }, select: { key: true, name: true } })]);
  return (
    <>
      <AdminTitle title="Workspaces" description={`${data.total} workspaces`}>
        <SearchForm q={q} placeholder="Search name or slug" />
      </AdminTitle>
      <Table>
        <THead>
          <TR>
            <TH>Workspace</TH>
            <TH>Owner</TH>
            <TH>Status</TH>
            <TH>Plan</TH>
            <TH>Members / channels / posts</TH>
            <TH>Created</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {data.items.map((w) => (
            <TR key={w.id}>
              <TD>
                <p className="font-medium">{w.name}</p>
                <p className="text-xs text-muted">/{w.slug}</p>
              </TD>
              <TD className="text-[13px] text-muted">{w.members[0]?.user.email ?? '—'}</TD>
              <TD>
                <Badge variant={w.status === 'ACTIVE' ? 'success' : 'danger'}>{w.status.toLowerCase()}</Badge>
                {w.suspendReason && <p className="mt-0.5 max-w-[160px] truncate text-xs text-muted">{w.suspendReason}</p>}
              </TD>
              <TD>
                {w.subscription?.provider === 'RAZORPAY' ? (
                  <Badge variant="info">{w.subscription.plan.name} (paid)</Badge>
                ) : (
                  <PlanSelect workspaceId={w.id} current={w.subscription?.plan.key ?? 'free'} plans={plans} />
                )}
              </TD>
              <TD className="tabular-nums">
                {w._count.members} / {w._count.socialAccounts} / {w._count.posts}
              </TD>
              <TD className="text-muted">{formatAgo(w.createdAt)}</TD>
              <TD className="text-right">
                {w.status === 'ACTIVE' ? (
                  <AdminAction
                    url={`/api/admin/workspaces/${w.id}`}
                    body={{ action: 'suspend' }}
                    label="Suspend"
                    confirmTitle={`Suspend ${w.name}?`}
                    confirmText="Scheduled posts are cancelled and the workspace becomes read-only."
                    destructive
                    askReason
                  />
                ) : (
                  <AdminAction url={`/api/admin/workspaces/${w.id}`} body={{ action: 'activate' }} label="Activate" confirmTitle={`Reactivate ${w.name}?`} />
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} base="/admin/workspaces" q={q} />
    </>
  );
}
