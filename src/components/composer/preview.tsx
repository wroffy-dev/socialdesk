'use client';

import { useState } from 'react';
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Send, Share2, ThumbsUp } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { ComposerChannel, MediaDto } from './types';

function Caption({ text, clamp }: { text: string; clamp?: boolean }) {
  const parts = text.split(/((?:^|\s)[#@][\p{L}\p{N}_.]+)/gu);
  return (
    <p className={cn('whitespace-pre-wrap break-words text-[13px] leading-relaxed', clamp && 'line-clamp-6')}>
      {parts.map((p, i) => (/^\s?[#@]/u.test(p) ? <span key={i} className="text-info">{p}</span> : <span key={i}>{p}</span>))}
    </p>
  );
}

function MediaView({ m, className }: { m: MediaDto; className?: string }) {
  return m.kind === 'IMAGE' ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.url} alt={m.altText ?? ''} className={cn('size-full object-cover', className)} />
  ) : (
    <video src={m.url} controls muted playsInline className={cn('size-full bg-black object-contain', className)} />
  );
}

function InstagramPreview({ channel, caption, media }: { channel: ComposerChannel; caption: string; media: MediaDto[] }) {
  const [idx, setIdx] = useState(0);
  const current = media[Math.min(idx, media.length - 1)];
  const handle = channel.username ?? channel.name;
  const ratio = current?.width && current.height ? Math.min(Math.max(current.width / current.height, 0.8), 1.91) : 0.8;
  return (
    <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Avatar name={channel.name} src={channel.avatarUrl} size={28} />
        <span className="flex-1 text-[13px] font-semibold">{handle}</span>
        <MoreHorizontal className="size-4" />
      </div>
      <div className="relative bg-subtle" style={{ aspectRatio: current?.kind === 'VIDEO' ? '9 / 16' : String(ratio) }}>
        {current ? <MediaView m={current} /> : <div className="flex size-full items-center justify-center text-xs text-faint">Instagram needs an image or video</div>}
        {media.length > 1 && (
          <>
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
              {idx + 1}/{media.length}
            </span>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
              {media.map((m, i) => (
                <button key={m.id} onClick={() => setIdx(i)} className={cn('size-1.5 rounded-full', i === idx ? 'bg-white' : 'bg-white/50')} aria-label={`Slide ${i + 1}`} />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-3 px-3 pt-2.5">
        <Heart className="size-5" /> <MessageCircle className="size-5" /> <Send className="size-5" />
        <Bookmark className="ml-auto size-5" />
      </div>
      <div className="px-3 pb-3 pt-2">
        {caption ? (
          <div className="text-[13px]">
            <span className="mr-1 font-semibold">{handle}</span>
            <Caption text={caption} clamp />
          </div>
        ) : (
          <p className="text-xs text-faint">No caption</p>
        )}
      </div>
    </div>
  );
}

function FacebookPreview({ channel, caption, media, linkUrl }: { channel: ComposerChannel; caption: string; media: MediaDto[]; linkUrl: string | null }) {
  const shown = media.slice(0, 4);
  return (
    <div className="mx-auto w-full max-w-[380px] overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-center gap-2 px-3 pt-3">
        <Avatar name={channel.name} src={channel.avatarUrl} size={34} />
        <div className="flex-1">
          <p className="text-[13px] font-semibold">{channel.name}</p>
          <p className="text-xs text-muted">Just now · 🌐</p>
        </div>
        <MoreHorizontal className="size-4" />
      </div>
      <div className="px-3 py-2.5">{caption ? <Caption text={caption} /> : !media.length && <p className="text-xs text-faint">Write something…</p>}</div>
      {shown.length > 0 && (
        <div className={cn('grid gap-0.5', shown.length > 1 && 'grid-cols-2')}>
          {shown.map((m, i) => (
            <div key={m.id} className={cn('relative bg-subtle', shown.length === 3 && i === 0 && 'col-span-2', shown.length === 1 ? 'aspect-[4/3]' : 'aspect-square')}>
              <MediaView m={m} />
              {i === 3 && media.length > 4 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xl font-semibold text-white">+{media.length - 4}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {linkUrl && shown.length === 0 && (
        <div className="mx-3 mb-2 rounded-md border border-line bg-subtle px-3 py-2">
          <p className="truncate text-xs uppercase text-muted">{(() => { try { return new URL(linkUrl).hostname; } catch { return linkUrl; } })()}</p>
          <p className="truncate text-[13px] font-medium">Link preview is generated by Facebook</p>
        </div>
      )}
      <div className="mt-1 flex justify-around border-t border-line py-2 text-[13px] text-muted">
        <span className="flex items-center gap-1.5"><ThumbsUp className="size-4" /> Like</span>
        <span className="flex items-center gap-1.5"><MessageCircle className="size-4" /> Comment</span>
        <span className="flex items-center gap-1.5"><Share2 className="size-4" /> Share</span>
      </div>
    </div>
  );
}

export function PostPreview(props: { channel: ComposerChannel; caption: string; media: MediaDto[]; linkUrl: string | null }) {
  return props.channel.platform === 'INSTAGRAM' ? <InstagramPreview {...props} /> : <FacebookPreview {...props} />;
}
