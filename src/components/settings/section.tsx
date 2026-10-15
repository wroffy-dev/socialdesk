import { cn } from '@/lib/utils';

export function SettingsSection({ title, description, children, className, danger }: { title: string; description?: React.ReactNode; children: React.ReactNode; className?: string; danger?: boolean }) {
  return (
    <section className={cn('rounded-xl border p-5', danger ? 'border-danger-line' : 'border-line', className)}>
      <h2 className={cn('text-[15px] font-semibold', danger && 'text-danger')}>{title}</h2>
      {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
