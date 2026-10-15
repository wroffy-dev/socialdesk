'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Building2, CreditCard, History, Layers, MessageSquareQuote, ShieldCheck, Tag, User, Users } from 'lucide-react';
import type { Permission } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const ITEMS: { href: string; label: string; icon: typeof User; perm?: Permission; group: string }[] = [
  { href: 'general', label: 'General', icon: Building2, group: 'Workspace' },
  { href: 'members', label: 'Team members', icon: Users, group: 'Workspace' },
  { href: 'roles', label: 'Roles & permissions', icon: ShieldCheck, group: 'Workspace' },
  { href: '../channels', label: 'Projects & channels', icon: Layers, group: 'Workspace' },
  { href: 'tags', label: 'Tags', icon: Tag, group: 'Workspace' },
  { href: 'saved-replies', label: 'Saved replies', icon: MessageSquareQuote, group: 'Workspace' },
  { href: 'billing', label: 'Billing & plan', icon: CreditCard, perm: 'billing.view', group: 'Workspace' },
  { href: 'audit', label: 'Audit log', icon: History, perm: 'audit.view', group: 'Workspace' },
  { href: 'profile', label: 'Profile & preferences', icon: User, group: 'You' },
  { href: 'notifications', label: 'Notifications', icon: Bell, group: 'You' },
];

export function SettingsNav({ slug, permissions }: { slug: string; permissions: Permission[] }) {
  const pathname = usePathname();
  const base = `/w/${slug}/settings`;
  const items = ITEMS.filter((i) => !i.perm || permissions.includes(i.perm));
  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-52 md:flex-col md:overflow-visible" aria-label="Settings">
      {['Workspace', 'You'].map((group) => (
        <div key={group} className="contents md:mb-3 md:flex md:flex-col md:gap-0.5">
          <p className="hidden px-2.5 pb-1 text-xs font-medium text-muted md:block">{group}</p>
          {items
            .filter((i) => i.group === group)
            .map((i) => {
              const href = i.href.startsWith('..') ? `/w/${slug}/channels` : `${base}/${i.href}`;
              const active = pathname === href;
              return (
                <Link
                  key={i.href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] text-fg/80 hover:bg-subtle',
                    active && 'bg-hover font-medium text-fg',
                  )}
                >
                  <i.icon className="size-4 text-muted" /> {i.label}
                </Link>
              );
            })}
        </div>
      ))}
    </nav>
  );
}
