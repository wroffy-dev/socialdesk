'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Info } from 'lucide-react';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlatformIcon } from '@/components/platform-icon';
import { COMING_SOON } from '@/lib/platforms';
import { useShell } from '@/components/shell/shell-context';
import { Badge } from '@/components/ui/badge';

type Platform = 'INSTAGRAM' | 'FACEBOOK';
interface OpenOptions {
  projectId?: string;
  platform?: Platform;
}

type OpenFn = (o?: OpenOptions | React.SyntheticEvent) => void;

const Ctx = createContext<{ isOpen: boolean; options: OpenOptions; open: OpenFn; close: () => void }>({
  isOpen: false,
  options: {},
  open: () => {},
  close: () => {},
});

export function ConnectDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ isOpen: boolean; options: OpenOptions }>({ isOpen: false, options: {} });
  // Also usable directly as a click handler (`onClick={connect.open}`); the event carries no options.
  const open = useCallback<OpenFn>((o) => setState({ isOpen: true, options: o && !('nativeEvent' in o) ? o : {} }), []);
  const close = useCallback(() => setState((s) => ({ ...s, isOpen: false })), []);
  const value = useMemo(() => ({ ...state, open, close }), [state, open, close]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useConnectDialog = () => useContext(Ctx);

const OPTIONS = [
  {
    platform: 'INSTAGRAM' as const,
    label: 'Instagram',
    description: 'A professional (Business or Creator) account linked to a Facebook Page.',
  },
  { platform: 'FACEBOOK' as const, label: 'Facebook Page', description: 'A Page you manage. Personal profiles are not supported by Meta.' },
];

/** Connect URL for one project slot. Both platforms are authorised through Facebook Login. */
export function connectHref(workspaceId: string, projectId: string, platform: Platform) {
  return `/api/w/${workspaceId}/channels/connect/meta?project=${encodeURIComponent(projectId)}&platform=${platform}`;
}

/**
 * Picks the project and platform, then starts Meta's official OAuth flow. Each project holds one
 * Instagram account and one Facebook Page.
 */
export function ConnectChannelDialog() {
  const { isOpen, options, close } = useConnectDialog();
  const { workspace, user, projects } = useShell();
  const firstWithSpace = projects.find((p) => !p.instagram || !p.facebook) ?? projects[0];
  const [projectId, setProjectId] = useState(options.projectId ?? firstWithSpace?.id ?? '');
  useEffect(() => {
    if (isOpen) setProjectId(options.projectId ?? firstWithSpace?.id ?? '');
  }, [isOpen, options.projectId, firstWithSpace?.id]);
  const project = projects.find((p) => p.id === projectId);
  const shown = options.platform ? OPTIONS.filter((o) => o.platform === options.platform) : OPTIONS;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect a channel</DialogTitle>
          <DialogDescription>
            Each project links one Instagram account and one Facebook Page. You&apos;ll sign in with Facebook to grant access.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="pb-5">
          {!user.emailVerified && (
            <div className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning">
              <Info className="mt-0.5 size-4 shrink-0" /> Verify your email before connecting channels.
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="connect-project">Project</Label>
            <NativeSelect id="connect-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            {shown.map((o) => {
              const linked = o.platform === 'INSTAGRAM' ? project?.instagram : project?.facebook;
              const enabled = user.emailVerified && !!project;
              return (
                <a
                  key={o.platform}
                  href={enabled ? connectHref(workspace.id, projectId, o.platform) : undefined}
                  aria-disabled={!enabled}
                  className="group flex items-center gap-3 rounded-lg border border-line p-3 transition-colors hover:border-line-strong hover:bg-subtle aria-disabled:pointer-events-none aria-disabled:opacity-50"
                >
                  <PlatformIcon platform={o.platform} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{o.label}</span>
                    <span className="block text-xs text-muted">
                      {linked ? `Linked: ${linked.username ? `@${linked.username}` : linked.name}. Continue to reconnect it.` : o.description}
                    </span>
                  </span>
                  <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
                </a>
              );
            })}
            {!options.platform &&
              COMING_SOON.map((p) => (
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
