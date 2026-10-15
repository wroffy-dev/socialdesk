import { listUsers } from '@/server/services/admin';
import { AdminTitle } from '@/components/admin/ui';
import { AdminAction } from '@/components/admin/admin-action';
import { Pager, SearchForm } from '@/components/admin/search-form';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatAgo } from '@/lib/time';

export const metadata = { title: 'Users' };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q, page } = await searchParams;
  const data = await listUsers(q, Math.max(1, Number(page) || 1));
  return (
    <>
      <AdminTitle title="Users" description={`${data.total} users`}>
        <SearchForm q={q} placeholder="Search name or email" />
      </AdminTitle>
      <Table>
        <THead>
          <TR>
            <TH>User</TH>
            <TH>Status</TH>
            <TH>Workspaces</TH>
            <TH>Last sign-in</TH>
            <TH>Joined</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {data.items.map((u) => (
            <TR key={u.id}>
              <TD>
                <p className="font-medium">{u.name ?? '—'}</p>
                <p className="text-xs text-muted">{u.email}</p>
              </TD>
              <TD className="space-x-1">
                <Badge variant={u.status === 'ACTIVE' ? 'success' : 'danger'}>{u.status.toLowerCase()}</Badge>
                {!u.emailVerified && <Badge variant="warning">unverified</Badge>}
                {u.isSuperAdmin && <Badge variant="violet">admin</Badge>}
              </TD>
              <TD>{u._count.memberships}</TD>
              <TD className="text-muted">{u.lastLoginAt ? formatAgo(u.lastLoginAt) : 'Never'}</TD>
              <TD className="text-muted">{formatAgo(u.createdAt)}</TD>
              <TD className="space-x-1 whitespace-nowrap text-right">
                <AdminAction url={`/api/admin/users/${u.id}`} body={{ action: 'revoke_sessions' }} label="Sign out" confirmTitle={`Sign ${u.email} out everywhere?`} variant="ghost" />
                {u.status === 'ACTIVE' ? (
                  <AdminAction url={`/api/admin/users/${u.id}`} body={{ action: 'suspend' }} label="Suspend" confirmTitle={`Suspend ${u.email}?`} confirmText="They are signed out and can't sign in until reactivated." destructive />
                ) : (
                  <AdminAction url={`/api/admin/users/${u.id}`} body={{ action: 'activate' }} label="Reactivate" confirmTitle={`Reactivate ${u.email}?`} />
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} base="/admin/users" q={q} />
    </>
  );
}
