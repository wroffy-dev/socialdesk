import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-hover', className)} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-muted', className)} aria-label="Loading" />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-subtle px-6 py-10 text-center', className)}>
      {icon && <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-surface text-muted [&_svg]:size-5">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const ALERT_STYLES = {
  info: { cls: 'border-info/25 bg-info-soft text-info', Icon: Info },
  success: { cls: 'border-accent-ink/25 bg-accent-soft text-accent-ink', Icon: CheckCircle2 },
  warning: { cls: 'border-warning/25 bg-warning-soft text-warning', Icon: TriangleAlert },
  danger: { cls: 'border-danger-line bg-danger-soft text-danger', Icon: AlertCircle },
} as const;

export function Alert({
  variant = 'info',
  title,
  children,
  action,
  className,
}: {
  variant?: keyof typeof ALERT_STYLES;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { cls, Icon } = ALERT_STYLES[variant];
  return (
    <div role={variant === 'danger' ? 'alert' : 'status'} className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]', cls, className)}>
      <Icon className="mt-px size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'text-fg/80')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
