'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Mail, MoreHorizontal, RefreshCw, UserMinus, UserPlus, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Alert } from '@/components/ui/feedback';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/components/ui/confirm';
import { api, errorMessage } from '@/lib/api-client';
import { ROLE_DESCRIPTION, ROLE_LABEL, type Role } from '@/lib/permissions';
import { formatAgo } from '@/lib/time';
import { SettingsSection } from './section';

interface Data {
  members: { id: string; role: Role; createdAt: string; user: { id: string; name: string | null; email: string; image: string | null } }[];
  invitations: { id: string; email: string; role: Role; expiresAt: string; createdAt: string; expired: boolean; invitedBy: { name: string | null; email: string } | null }[];
}

export function MembersManager({
  workspaceId,
  currentUserId,
  currentRole,
  canManage,
  assignable,
  emailVerified,
  seatLimit,
  planName,
  initial,
}: {
  workspaceId: string;
  currentUserId: string;
  currentRole: Role;
  canManage: boolean;
  assignable: Role[];
  emailVerified: boolean;
  seatLimit: number | null;
  planName: string;
  initial: Data;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [data, setData] = useState(initial);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('PUBLISHER');
  const [inviting, setInviting] = useState(false);
  const used = data.members.length + data.invitations.filter((i) => !i.expired).length;

  const reload = async () => {
    const res = await api<Data>(`/api/w/${workspaceId}/members`);
    setData(res);
    router.refresh();
  };
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {canManage && (
        <SettingsSection title="Invite a teammate" description={`${used} of ${seatLimit ?? 'unlimited'} seats used on the ${planName} plan (pending invitations count).`}>
          {!emailVerified && <Alert variant="warning" className="mb-3">Verify your email address before inviting teammates.</Alert>}
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              setInviting(true);
              await run(() => api(`/api/w/${workspaceId}/members`, { body: { email, role } }), `Invitation sent to ${email}`);
              setEmail('');
              setInviting(false);
            }}
          >
            <Input type="email" required placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" className="flex-1" />
            <NativeSelect value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role" className="sm:w-40">
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" variant="primary" loading={inviting} disabled={!emailVerified || !email}>
              <UserPlus /> Invite
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted">{ROLE_DESCRIPTION[role]}</p>
        </SettingsSection>
      )}

      <SettingsSection title={`Members (${data.members.length})`}>
        <ul className="-my-2 divide-y divide-line">
          {data.members.map((m) => {
            const self = m.user.id === currentUserId;
            const editable = canManage && !self && (m.role !== 'OWNER' || currentRole === 'OWNER');
            return (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={m.user.name ?? m.user.email} src={m.user.image} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">
                    {m.user.name ?? m.user.email} {self && <span className="font-normal text-muted">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {m.user.email} · joined {formatAgo(m.createdAt)}
                  </p>
                </div>
                {editable ? (
                  <NativeSelect
                    value={m.role}
                    onChange={(e) => run(() => api(`/api/w/${workspaceId}/members/${m.id}`, { method: 'PATCH', body: { role: e.target.value } }), 'Role updated')}
                    className="h-8 w-32 text-[13px]"
                    aria-label={`Role for ${m.user.email}`}
                  >
                    {[...new Set([m.role, ...assignable])].map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <Badge variant={m.role === 'OWNER' ? 'violet' : 'neutral'}>{ROLE_LABEL[m.role]}</Badge>
                )}
                {editable && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Member actions">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        destructive
                        onSelect={async () => {
                          if (!(await confirm({ title: `Remove ${m.user.name ?? m.user.email}?`, description: 'They lose access to this workspace immediately.', confirmLabel: 'Remove', destructive: true }))) return;
                          await run(() => api(`/api/w/${workspaceId}/members/${m.id}`, { method: 'DELETE' }), 'Member removed');
                        }}
                      >
                        <UserMinus /> Remove from workspace
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>
      </SettingsSection>

      {data.invitations.length > 0 && (
        <SettingsSection title={`Pending invitations (${data.invitations.length})`}>
          <ul className="-my-2 divide-y divide-line">
            {data.invitations.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2.5">
                <span className="flex size-8 items-center justify-center rounded-full bg-subtle text-muted">
                  <Mail className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px]">{i.email}</p>
                  <p className="text-xs text-muted">
                    {ROLE_LABEL[i.role]} · invited {formatAgo(i.createdAt)}
                    {i.invitedBy && ` by ${i.invitedBy.name ?? i.invitedBy.email}`}
                  </p>
                </div>
                {i.expired ? <Badge variant="warning">Expired</Badge> : <Badge variant="info">Pending</Badge>}
                {canManage && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => run(() => api(`/api/w/${workspaceId}/invitations/${i.id}`, { method: 'POST' }), 'Invitation resent')}>
                      <RefreshCw /> Resend
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => run(() => api(`/api/w/${workspaceId}/invitations/${i.id}`, { method: 'DELETE' }), 'Invitation revoked')}>
                      <XCircle /> Revoke
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </SettingsSection>
      )}
    </div>
  );
}
