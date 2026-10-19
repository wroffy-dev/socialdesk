'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BarChart3, Building2, FileText, History, MessageSquareQuote, Plug, Send, Tags, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/admin', label: 'Overview', icon: BarChart3 },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/workspaces', label: 'Workspaces', icon: Building2 },
  { href: '/admin/plans', label: 'Plans & limits', icon: Tags },
  { href: '/admin/publishing', label: 'Publishing failures', icon: Send },
  { href: '/admin/integrations', label: 'Integration health', icon: Plug },
  { href: '/admin/jobs', label: 'Background jobs', icon: Activity },
  { href: '/admin/audit', label: 'Audit log', icon: History },
  { href: '/admin/testimonials', label: 'Testimonials & logos', icon: MessageSquareQuote },
  { href: '/admin/content', label: 'Legal pages', icon: FileText },
];

export function AdminNav({ horizontal }: { horizontal?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={cn('flex gap-0.5', horizontal ? 'overflow-x-auto' : 'flex-col')} aria-label="Admin">
      {ITEMS.map((i) => {
        const active = i.href === '/admin' ? pathname === '/admin' : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? 'page' : undefined}
            className={cn('flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[14px] text-fg/85 hover:bg-hover', active && 'bg-hover font-medium text-fg')}
          >
            <i.icon className="size-4 text-fg/70" /> {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
