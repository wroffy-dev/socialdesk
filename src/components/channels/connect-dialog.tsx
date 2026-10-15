'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ArrowRight, Info } from 'lucide-react';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PlatformIcon } from '@/components/platform-icon';
import { COMING_SOON } from '@/lib/platforms';
import { useShell } from '@/components/shell/shell-context';
import { Badge } from '@/components/ui/badge';

const Ctx = createContext<{ isOpen: boolean; open: () => void; close: () => void }>({ isOpen: false, open: () => {}, close: () => {} });

export function ConnectDialogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useConnectDialog = () => useContext(Ctx);

const OPTIONS = [
  {
    platform: 'INSTAGRAM' as const,
    label: 'Instagram',
    description: 'Professional (Business or Creator) accounts linked to a Facebook Page.',
  },
  { platform: 'FACEBOOK' as const, label: 'Facebook Page', description: 'Pages you manage. Personal profiles are not supported by Meta.' },
];

/** Starts Meta's official OAuth flow. Both platforms are authorised through Facebook Login. */
export function ConnectChannelDialog() {
  const { isOpen, close } = useConnectDialog();
  const { workspace, user } = useShell();
  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect a channel</DialogTitle>
          <DialogDescription>You&apos;ll sign in with Facebook to grant access. You can choose exactly which accounts to add.</DialogDescription>
        </DialogHeader>
        <DialogBody className="pb-5">
          {!user.emailVerified && (
            <div className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning">
              <Info className="mt-0.5 size-4 shrink-0" /> Verify your email before connecting channels.
            </div>
          )}
          <div className="flex flex-col gap-2">
            {OPTIONS.map((o) => (
              <a
                key={o.platform}
                href={user.emailVerified ? `/api/w/${workspace.id}/channels/connect/meta?platform=${o.platform}` : undefined}
                aria-disabled={!user.emailVerified}
                className="group flex items-center gap-3 rounded-lg border border-line p-3 transition-colors hover:border-line-strong hover:bg-subtle aria-disabled:pointer-events-none aria-disabled:opacity-50"
              >
                <PlatformIcon platform={o.platform} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{o.label}</span>
                  <span className="block text-xs text-muted">{o.description}</span>
                </span>
                <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
              </a>
            ))}
            {COMING_SOON.map((p) => (
              <div key={p.key} className="flex items-center gap-3 rounded-lg border border-dashed border-line p-3 opacity-70">
                <PlatformIcon platform={p.key} size={32} muted />
                <span className="flex-1 font-medium text-muted">{p.label}</span>
                <Badge>Coming soon</Badge>
              </div>
            ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
