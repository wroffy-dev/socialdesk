import { cn } from '@/lib/utils';
import { Avatar } from './ui/avatar';

type Key = 'INSTAGRAM' | 'FACEBOOK' | 'threads' | 'linkedin' | 'bluesky' | 'pinterest';

const BG: Record<Key, string> = {
  INSTAGRAM: 'linear-gradient(45deg,#f9a825 0%,#e1306c 50%,#833ab4 100%)',
  FACEBOOK: '#1877f2',
  threads: '#111111',
  linkedin: '#0a66c2',
  bluesky: '#1185fe',
  pinterest: '#e60023',
};

function Glyph({ platform }: { platform: Key }) {
  const common = { fill: 'none', stroke: 'white', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (platform) {
    case 'INSTAGRAM':
      return (
        <>
          <rect x="4" y="4" width="16" height="16" rx="4.5" {...common} />
          <circle cx="12" cy="12" r="3.6" {...common} />
          <circle cx="16.8" cy="7.2" r="0.6" fill="white" />
        </>
      );
    case 'FACEBOOK':
      return <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8v3h2.6V21" fill="white" />;
    case 'threads':
      return <path d="M16.5 11.2c-.3-2.2-1.8-3.4-4.2-3.4-2.6 0-4.3 1.9-4.3 4.4 0 2.6 1.7 4.3 4.4 4.3 2 0 3.4-1 3.4-2.6 0-1.4-1.1-2.3-3-2.3-1.6 0-2.4.7-2.4 1.6 0 .8.7 1.3 1.6 1.3 1.6 0 2.6-1.3 2.6-3.6" {...common} strokeWidth={1.8} />;
    case 'linkedin':
      return (
        <>
          <path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7" {...common} />
        </>
      );
    case 'bluesky':
      return <path d="M12 11c-1.5-3-4-5-6-5.5-1-.2-1 1-1 2 0 1.5.5 4 2.5 4.5-2 .5-2.5 2-1 3.5 2 2 4 0 5.5-2.5 1.5 2.5 3.5 4.5 5.5 2.5 1.5-1.5 1-3-1-3.5 2-.5 2.5-3 2.5-4.5 0-1 0-2.2-1-2-2 .5-4.5 2.5-6 5.5Z" fill="white" />;
    case 'pinterest':
      return <path d="M11 13.5 9.5 20M8.5 12.5c-.5-3 1.5-6 4.5-6 2.5 0 4 1.7 4 3.8 0 2.7-1.4 4.7-3.4 4.7-1.1 0-1.9-.9-1.6-2l.7-2.8" {...common} />;
  }
}

/** A platform's logo mark on its brand colour. */
export function PlatformIcon({ platform, size = 16, className, muted }: { platform: Key; size?: number; className?: string; muted?: boolean }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-[28%]', muted && 'opacity-40 grayscale', className)}
      style={{ width: size, height: size, background: BG[platform] }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.78} height={size * 0.78}>
        <Glyph platform={platform} />
      </svg>
    </span>
  );
}

/** Channel avatar with the platform badge in the corner, as in the sidebar. */
export function ChannelAvatar({
  name,
  avatarUrl,
  platform,
  size = 28,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  platform: 'INSTAGRAM' | 'FACEBOOK';
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      <Avatar name={name} src={avatarUrl} size={size} rounded="md" className="border border-line" />
      <PlatformIcon platform={platform} size={Math.round(size * 0.5)} className="absolute -bottom-1 -right-1 ring-2 ring-surface" />
    </span>
  );
}
