'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm';
import { api, errorMessage } from '@/lib/api-client';
import { SettingsSection } from './section';

export function ProfileSettings({ user }: { user: { name: string; email: string; timezone: string | null; emailVerified: boolean } }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection title="Profile">
        <div className="flex flex-col gap-4">
          <Field label="Name" htmlFor="name">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Email</span>
            <div className="flex items-center gap-2 text-[13px]">
              {user.email}
              {user.emailVerified ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">Not verified</Badge>}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              variant="primary"
              loading={saving}
              disabled={!name.trim() || name === user.name}
              onClick={async () => {
                setSaving(true);
                try {
                  await api('/api/account/profile', { method: 'PATCH', body: { name: name.trim() } });
                  toast.success('Profile saved');
                  router.refresh();
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Password" description="Changing your password signs you out on every device.">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setPwError(null);
            if (pw.newPassword !== pw.confirm) return setPwError("New passwords don't match.");
            setChanging(true);
            try {
              await api('/api/account/password', { body: { currentPassword: pw.currentPassword, newPassword: pw.newPassword } });
              toast.success('Password changed. Please sign in again.');
              await signOut({ redirectTo: '/login' });
            } catch (err) {
              setPwError(errorMessage(err));
              setChanging(false);
            }
          }}
        >
          <Field label="Current password" htmlFor="cur">
            <Input id="cur" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </Field>
          <Field label="New password" htmlFor="new" hint="At least 10 characters, with a letter and a number.">
            <Input id="new" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm" error={pwError ?? undefined}>
            <Input id="confirm" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={changing} disabled={!pw.currentPassword || !pw.newPassword}>
              Change password
            </Button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection title="Sessions" description="Sign out of SocialDesk on every browser and device, including this one.">
        <Button
          variant="outline"
          onClick={async () => {
            if (!(await confirm({ title: 'Sign out everywhere?', confirmLabel: 'Sign out everywhere' }))) return;
            try {
              await api('/api/account/sign-out-everywhere', { method: 'POST' });
              await signOut({ redirectTo: '/login' });
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        >
          Sign out everywhere
        </Button>
      </SettingsSection>
    </div>
  );
}
