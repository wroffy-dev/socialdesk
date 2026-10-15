import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    variant: {
      neutral: 'bg-subtle text-muted border border-line',
      success: 'bg-accent-soft text-accent-ink',
      danger: 'bg-danger-soft text-danger',
      warning: 'bg-warning-soft text-warning',
      info: 'bg-info-soft text-info',
      violet: 'bg-violet-soft text-violet',
      outline: 'border border-line text-fg',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
