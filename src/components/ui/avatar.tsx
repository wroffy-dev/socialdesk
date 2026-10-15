import { cn, initials } from '@/lib/utils';

const TINTS = ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3', '#ede9fe', '#e0f2fe', '#ffedd5'];

function tintFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function Avatar({
  name,
  src,
  size = 28,
  className,
  rounded = 'full',
}: {
  name: string | null | undefined;
  src?: string | null;
  size?: number;
  className?: string;
  rounded?: 'full' | 'md';
}) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  const radius = rounded === 'full' ? 'rounded-full' : 'rounded-md';
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={style} className={cn('shrink-0 object-cover', radius, className)} />;
  }
  return (
    <span
      aria-hidden
      style={{ ...style, background: tintFor(name ?? '?') }}
      className={cn('inline-flex shrink-0 items-center justify-center font-semibold text-fg/80', radius, className)}
    >
      {initials(name)}
    </span>
  );
}
