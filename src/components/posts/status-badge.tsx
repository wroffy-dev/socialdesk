import { Badge, type BadgeProps } from '@/components/ui/badge';

type AnyStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'PARTIALLY_PUBLISHED'
  | 'FAILED'
  | 'CANCELLED'
  | 'NEEDS_VERIFICATION';

const MAP: Record<AnyStatus, { label: string; variant: BadgeProps['variant'] }> = {
  DRAFT: { label: 'Draft', variant: 'neutral' },
  SCHEDULED: { label: 'Scheduled', variant: 'info' },
  PUBLISHING: { label: 'Publishing', variant: 'violet' },
  PUBLISHED: { label: 'Published', variant: 'success' },
  PARTIALLY_PUBLISHED: { label: 'Partly published', variant: 'warning' },
  FAILED: { label: 'Failed', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
  NEEDS_VERIFICATION: { label: 'Needs check', variant: 'warning' },
};

export function StatusBadge({ status, className }: { status: AnyStatus; className?: string }) {
  const s = MAP[status];
  return (
    <Badge variant={s.variant} className={className}>
      {s.label}
    </Badge>
  );
}

export const STATUS_DOT: Record<AnyStatus, string> = {
  DRAFT: 'bg-faint',
  SCHEDULED: 'bg-info',
  PUBLISHING: 'bg-violet',
  PUBLISHED: 'bg-accent-ink',
  PARTIALLY_PUBLISHED: 'bg-warning',
  FAILED: 'bg-danger',
  CANCELLED: 'bg-line-strong',
  NEEDS_VERIFICATION: 'bg-warning',
};
