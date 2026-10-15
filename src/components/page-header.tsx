import { cn } from '@/lib/utils';

/** Page title row: icon tile + title on the left, actions on the right (as in the Publish screen). */
export function PageHeader({
  icon,
  title,
  description,
  actions,
  className,
  children,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-3 px-5 pb-4 pt-5 sm:px-8 sm:pt-7', className)}>
      <div className="flex flex-wrap items-center gap-3">
        {icon && (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface shadow-card [&_svg]:size-5">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="page-title truncate">{title}</h1>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function PageBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-6 px-5 pb-10 sm:px-8', className)} {...props} />;
}
