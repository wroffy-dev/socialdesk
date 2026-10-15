import Link from 'next/link';
import { Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2 font-semibold tracking-tight text-fg', className)}>
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-fg">
        <Sprout className="size-4" />
      </span>
      SocialDesk
    </Link>
  );
}
