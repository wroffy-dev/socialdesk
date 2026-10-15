import { Film, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ThumbMedia {
  kind: 'IMAGE' | 'VIDEO';
  url: string;
  thumbUrl: string | null;
  originalName?: string;
  durationSec?: number | null;
  altText?: string | null;
}

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Square-ish preview for an uploaded image or video. */
export function MediaThumb({ media, className, rounded = 'md' }: { media: ThumbMedia | null; className?: string; rounded?: 'md' | 'lg' | 'none' }) {
  const radius = rounded === 'none' ? '' : rounded === 'lg' ? 'rounded-lg' : 'rounded-md';
  if (!media) {
    return (
      <div className={cn('flex items-center justify-center bg-subtle text-faint', radius, className)}>
        <ImageOff className="size-5" />
      </div>
    );
  }
  return (
    <div className={cn('relative overflow-hidden bg-subtle', radius, className)}>
      {media.kind === 'IMAGE' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.thumbUrl ?? media.url} alt={media.altText ?? media.originalName ?? ''} className="size-full object-cover" loading="lazy" />
      ) : (
        <>
          <video src={`${media.url}#t=0.5`} preload="metadata" muted playsInline className="size-full object-cover" />
          <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-2xs text-white">
            <Film className="size-3" />
            {media.durationSec ? formatDuration(media.durationSec) : 'Video'}
          </span>
        </>
      )}
    </div>
  );
}
