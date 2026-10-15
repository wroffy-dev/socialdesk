'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { MailWarning, ShieldAlert } from 'lucide-react';
import { api, errorMessage } from '@/lib/api-client';
import { useShell } from './shell-context';

export function ShellBanners() {
  const { user, workspace } = useShell();
  const [sending, setSending] = useState(false);
  return (
    <>
      {workspace.status === 'SUSPENDED' && (
        <div className="flex items-center gap-2 border-b border-danger-line bg-danger-soft px-5 py-2 text-[13px] text-danger lg:rounded-t-xl">
          <ShieldAlert className="size-4 shrink-0" />
          This workspace is suspended. Content is read-only and nothing will be published. Contact support to restore access.
        </div>
      )}
      {!user.emailVerified && (
        <div className="flex flex-wrap items-center gap-2 border-b border-warning/20 bg-warning-soft px-5 py-2 text-[13px] text-warning lg:rounded-t-xl">
          <MailWarning className="size-4 shrink-0" />
          <span className="text-fg/80">Verify your email to connect channels, publish posts and invite teammates.</span>
          <button
            className="font-medium underline underline-offset-2 disabled:opacity-50"
            disabled={sending}
            onClick={async () => {
              setSending(true);
              try {
                await api('/api/account/resend-verification', { method: 'POST' });
                toast.success(`Verification email sent to ${user.email}`);
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setSending(false);
              }
            }}
          >
            Resend email
          </button>
        </div>
      )}
    </>
  );
}
