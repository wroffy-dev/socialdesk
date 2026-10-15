import { cn } from '@/lib/utils';

export function AdminTitle({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="flex-1">
        <h1 className="page-title">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function StatCard({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'danger' | 'warning' | 'ok' }) {
  return (
    <div className="rounded-lg border border-line bg-subtle p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tone === 'danger' && 'text-danger', tone === 'warning' && 'text-warning', tone === 'ok' && 'text-accent-ink')}>{value}</p>
    </div>
  );
}
