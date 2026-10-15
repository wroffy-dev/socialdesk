import Link from 'next/link';
import { CalendarDays, List, ListOrdered, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Title row shared by the calendar, list and queue views (matches the Publish reference screen). */
export function PublishHeader({ slug, active, canCreate }: { slug: string; active: 'calendar' | 'list' | 'queue'; canCreate: boolean }) {
  const base = `/w/${slug}/publish`;
  const tabs = [
    { key: 'list', href: `${base}/posts`, label: 'List', icon: List },
    { key: 'calendar', href: base, label: 'Calendar', icon: CalendarDays },
    { key: 'queue', href: `${base}/queue`, label: 'Queue', icon: ListOrdered },
  ] as const;
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 pb-3 pt-5 sm:px-8 sm:pt-7">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface shadow-card">
        <CalendarDays className="size-5" />
      </span>
      <h1 className="page-title">Publish</h1>
      <div className="ml-auto flex items-center gap-2">
        <nav className="flex rounded-lg border border-line p-0.5" aria-label="Publish views">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={active === t.key ? 'page' : undefined}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] transition-colors',
                active === t.key ? 'bg-accent-soft font-medium text-accent-ink' : 'text-fg/80 hover:bg-subtle',
              )}
            >
              <t.icon className="size-4" /> {t.label}
            </Link>
          ))}
        </nav>
        {canCreate && (
          <Button asChild variant="outline">
            <Link href={`/w/${slug}/compose`}>
              <Plus /> New Post
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
