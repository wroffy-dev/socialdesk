'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import type { ShellData } from '@/server/services/shell';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ShellProvider } from './shell-context';
import { Sidebar } from './sidebar';
import { ShellBanners } from './banners';
import { ConnectChannelDialog, ConnectDialogProvider } from '@/components/channels/connect-dialog';

const COLLAPSE_KEY = 'sd_sidebar_collapsed';

export function AppShell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* storage unavailable */
    }
    document.cookie = `sd_last_ws=${encodeURIComponent(data.workspace.slug)}; path=/; max-age=31536000; samesite=lax`;
  }, [data.workspace.slug]);

  useEffect(() => setMobileOpen(false), [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  return (
    <ShellProvider value={data}>
      <ConnectDialogProvider>
        <div className="flex min-h-screen bg-canvas">
          {/* Desktop sidebar */}
          <div className={cn('sticky top-0 hidden h-screen shrink-0 lg:block', collapsed ? 'w-[64px]' : 'w-[240px]')}>
            <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
          </div>

          {/* Mobile sidebar */}
          {mobileOpen && (
            <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
              <button className="absolute inset-0 bg-[rgb(30_28_24/0.35)]" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
              <div className="absolute inset-y-0 left-0 w-[260px] shadow-pop">
                <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
              </div>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col lg:py-1.5 lg:pr-1.5">
            <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-canvas px-3 lg:hidden">
              <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
                <Menu />
              </Button>
              <Logo href={`/w/${data.workspace.slug}/home`} className="text-sm" />
              <span className="ml-auto truncate text-[13px] text-muted">{data.workspace.name}</span>
            </header>
            <main className="flex min-h-[calc(100vh-12px)] min-w-0 flex-1 flex-col bg-surface lg:rounded-xl lg:border lg:border-line">
              <ShellBanners />
              {children}
            </main>
          </div>
        </div>
        <ConnectChannelDialog />
      </ConnectDialogProvider>
    </ShellProvider>
  );
}
