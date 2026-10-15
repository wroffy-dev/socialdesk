'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronsUpDown,
  House,
  ImageIcon,
  Lightbulb,
  LogOut,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Settings2,
  Shield,
  Upload,
  User,
  PenSquare,
  ListOrdered,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Tooltip } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChannelAvatar, PlatformIcon } from '@/components/platform-icon';
import { COMING_SOON } from '@/lib/platforms';
import { ROLE_LABEL } from '@/lib/permissions';
import { Logo } from '@/components/brand';
import { useCan, useShell } from './shell-context';
import { useConnectDialog } from '@/components/channels/connect-dialog';

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const data = useShell();
  const can = useCan();
  const pathname = usePathname();
  const router = useRouter();
  const connect = useConnectDialog();
  const base = `/w/${data.workspace.slug}`;

  const nav = [
    { href: `${base}/home`, label: 'Home', icon: House },
    can('posts.edit') && { href: `${base}/create`, label: 'Create', icon: Lightbulb },
    { href: `${base}/publish`, label: 'Publish', icon: CalendarDays, count: data.counts.scheduled },
    { href: `${base}/community`, label: 'Community', icon: MessagesSquare, count: data.counts.unanswered, highlight: data.counts.unanswered > 0 },
    { href: `${base}/insights`, label: 'Insights', icon: BarChart3 },
    { href: `${base}/media`, label: 'Media library', icon: ImageIcon },
  ].filter(Boolean) as { href: string; label: string; icon: typeof House; count?: number; highlight?: boolean }[];

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className={cn('flex h-full flex-col gap-3 overflow-y-auto bg-canvas px-3 py-3 scrollbar-thin', collapsed && 'items-center px-2')}>
      <div className={cn('flex h-8 items-center', collapsed ? 'justify-center' : 'justify-between px-1')}>
        {!collapsed && <Logo href={`${base}/home`} className="text-[15px]" />}
        <UserMenu collapsed={collapsed} />
      </div>

      {can('posts.edit') && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary font-medium text-primary-fg shadow-card transition-colors hover:bg-primary-hover',
                collapsed ? 'w-10' : 'w-full',
              )}
              aria-label="New"
            >
              <Plus className="size-4" />
              {!collapsed && 'New'}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => router.push(`${base}/compose`)}>
              <PenSquare /> New post
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push(`${base}/compose?mode=queue`)}>
              <ListOrdered /> Add post to queue
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push(`${base}/media?upload=1`)}>
              <Upload /> Upload media
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <nav className={cn('flex flex-col gap-0.5', collapsed && 'items-center')} aria-label="Main">
        {nav.map((item) => (
          <Tooltip key={item.href} content={item.label} side="right" disabled={!collapsed}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[14px] text-fg/85 transition-colors hover:bg-hover',
                isActive(item.href) && 'bg-hover font-medium text-fg',
                collapsed && 'w-10 justify-center px-0',
              )}
            >
              <item.icon className="size-[17px] shrink-0 text-fg/70" strokeWidth={1.8} />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && item.count !== undefined && (
                <span
                  className={cn(
                    'ml-auto min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums',
                    item.highlight ? 'bg-accent-soft font-medium text-accent-ink' : 'text-muted',
                  )}
                >
                  {item.count}
                </span>
              )}
              {collapsed && item.highlight && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-accent-ink" />}
            </Link>
          </Tooltip>
        ))}
      </nav>

      <div className={cn('mt-2 flex flex-col gap-1', collapsed && 'items-center')}>
        {!collapsed && (
          <div className="flex items-center justify-between px-2.5 text-[13px] text-muted">
            <span>Channels</span>
            <span className="flex items-center gap-0.5">
              <Tooltip content="Manage channels">
                <Link href={`${base}/channels`} onClick={onNavigate} className="rounded-md p-1 hover:bg-hover hover:text-fg" aria-label="Manage channels">
                  <Settings2 className="size-4" />
                </Link>
              </Tooltip>
              {can('channels.manage') && (
                <Tooltip content="Connect a channel">
                  <button onClick={connect.open} className="rounded-md p-1 hover:bg-hover hover:text-fg" aria-label="Connect a channel">
                    <Plus className="size-4" />
                  </button>
                </Tooltip>
              )}
            </span>
          </div>
        )}
        {data.channels.length === 0 && !collapsed && (
          <p className="px-2.5 py-1 text-[13px] text-faint">No channels connected yet.</p>
        )}
        {data.channels.map((c) => (
          <Tooltip key={c.id} content={c.name} side="right" disabled={!collapsed}>
            <Link
              href={`${base}/publish?channel=${c.id}`}
              onClick={onNavigate}
              className={cn('flex h-10 items-center gap-2.5 rounded-lg px-2 hover:bg-hover', collapsed && 'w-10 justify-center px-0')}
            >
              <span className="relative">
                <ChannelAvatar name={c.name} avatarUrl={c.avatarUrl} platform={c.platform} size={26} />
                {c.status !== 'CONNECTED' && (
                  <span className="absolute -left-1 -top-1 size-2.5 rounded-full border-2 border-canvas bg-danger" title="Needs attention" />
                )}
              </span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate text-[14px]">{c.username ?? c.name}</span>
                  <span className="text-xs tabular-nums text-muted">{c.scheduled}</span>
                </>
              )}
            </Link>
          </Tooltip>
        ))}
        {!collapsed && can('channels.manage') && (
          <div className="mt-2 px-2.5">
            <p className="mb-1.5 text-xs text-muted">Connect more channels</p>
            <div className="flex items-center gap-1.5">
              <button onClick={connect.open} className="rounded-md transition-transform hover:scale-105" aria-label="Connect Instagram">
                <PlatformIcon platform="INSTAGRAM" size={24} />
              </button>
              <button onClick={connect.open} className="rounded-md transition-transform hover:scale-105" aria-label="Connect Facebook">
                <PlatformIcon platform="FACEBOOK" size={24} />
              </button>
              {COMING_SOON.slice(0, 2).map((p) => (
                <Tooltip key={p.key} content={`${p.label} · coming soon`}>
                  <span>
                    <PlatformIcon platform={p.key} size={24} muted />
                  </span>
                </Tooltip>
              ))}
              <button
                onClick={connect.open}
                className="flex size-6 items-center justify-center rounded-md border border-line bg-surface text-muted hover:text-fg"
                aria-label="More channels"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={cn('mt-auto flex flex-col gap-1 border-t border-line pt-3', collapsed && 'items-center')}>
        <Tooltip content="Settings" side="right" disabled={!collapsed}>
          <Link
            href={`${base}/settings`}
            onClick={onNavigate}
            className={cn(
              'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-fg/85 hover:bg-hover',
              isActive(`${base}/settings`) && 'bg-hover font-medium text-fg',
              collapsed && 'w-10 justify-center px-0',
            )}
          >
            <Settings className="size-[17px] text-fg/70" strokeWidth={1.8} />
            {!collapsed && 'Settings'}
          </Link>
        </Tooltip>
        <div className={cn('flex items-center gap-1', collapsed && 'flex-col')}>
          <WorkspaceSwitcher collapsed={collapsed} />
          {onToggleCollapsed && (
            <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
              <button onClick={onToggleCollapsed} className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-fg" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </aside>
  );
}

function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const data = useShell();
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn('flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-hover', collapsed && 'flex-none')}
          aria-label="Switch workspace"
        >
          <Avatar name={data.workspace.name} src={data.workspace.logoUrl} size={32} rounded="md" />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{data.workspace.name}</span>
                <span className="block truncate text-xs text-muted">{data.workspace.planName} Plan</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {data.workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onSelect={() => router.push(`/w/${w.slug}/home`)}>
            <Avatar name={w.name} src={w.logoUrl} size={22} rounded="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{w.name}</span>
              <span className="block text-xs text-muted">
                {w.planName} · {ROLE_LABEL[w.role]}
                {w.status === 'SUSPENDED' && ' · Suspended'}
              </span>
            </span>
            {w.id === data.workspace.id && <Check className="!text-accent-ink" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/onboarding')}>
          <Plus /> Create workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const data = useShell();
  const router = useRouter();
  const base = `/w/${data.workspace.slug}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={cn('rounded-full', collapsed && 'mt-1')} aria-label="Account menu">
          <Avatar name={data.user.name ?? data.user.email} src={data.user.image} size={28} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={collapsed ? 'start' : 'end'} className="w-60">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{data.user.name}</p>
          <p className="truncate text-xs text-muted">{data.user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(`${base}/settings/profile`)}>
          <User /> Profile & preferences
        </DropdownMenuItem>
        {data.user.isSuperAdmin && (
          <DropdownMenuItem onSelect={() => router.push('/admin')}>
            <Shield /> Super admin
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut({ redirectTo: '/login' })}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
