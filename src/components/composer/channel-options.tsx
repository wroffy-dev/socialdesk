'use client';

import { useState } from 'react';
import { AtSign, Clapperboard, ImageIcon, MessageCircle, Plus, Smartphone, UserPlus, Users, X } from 'lucide-react';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import { charCount, inferFormat, xLength, type Platform, type PostFormat } from '@/lib/platforms';
import {
  FB_COMMENT_MAX,
  IG_COMMENT_MAX,
  IG_MAX_COLLABORATORS,
  IG_MAX_USER_TAGS,
  LI_COMMENT_MAX,
  X_REPLY_MAX,
  YT_COMMENT_MAX,
  YT_TITLE_MAX,
  youtubeTitle,
  type UserTag,
  type VersionOptions,
} from '@/lib/post-options';
import { cn } from '@/lib/utils';
import type { ComposerChannel, MediaDto } from './types';

const USERNAME = /^[a-z0-9._]{1,30}$/;

const COMMENT_MAX: Record<Platform, number> = { INSTAGRAM: IG_COMMENT_MAX, FACEBOOK: FB_COMMENT_MAX, X: X_REPLY_MAX, LINKEDIN: LI_COMMENT_MAX, YOUTUBE: YT_COMMENT_MAX };
const COMMENT_HINT: Record<Platform, string> = {
  INSTAGRAM: 'Posted right after publishing, e.g. extra hashtags or a link',
  FACEBOOK: 'Posted right after publishing, e.g. a link or extra details',
  X: 'Posted as a reply to your post right after publishing, e.g. a link or a second part',
  LINKEDIN: 'Posted right after publishing, e.g. a link (posts with links outside comments can get less reach)',
  YOUTUBE: 'Posted on the video right after uploading, e.g. a pinned-style note or links',
};
const cleanUsername = (raw: string) => raw.trim().replace(/^@+/, '').toLowerCase();

const FORMAT_LABEL: Record<PostFormat, string> = {
  FEED: 'Photo post',
  CAROUSEL: 'Carousel',
  REEL: 'Reel',
  STORY: 'Story',
  TEXT: 'Text post',
  LINK: 'Link post',
  VIDEO: 'Video',
  SHORT: 'Short',
};

/**
 * Per-channel publishing options: Story vs post, collaborators, tagged people and Reel settings
 * on Instagram, and a first comment on both platforms.
 */
export function ChannelOptions({
  channel,
  options,
  media,
  caption,
  disabled,
  onChange,
}: {
  channel: ComposerChannel;
  options: VersionOptions;
  media: MediaDto[];
  caption: string;
  disabled: boolean;
  onChange: (patch: Partial<VersionOptions>) => void;
}) {
  const ig = channel.platform === 'INSTAGRAM';
  const story = ig && options.igType === 'story';
  const format = inferFormat(channel.platform, { caption, media }, options);
  const isReel = format === 'REEL';
  const commentMax = COMMENT_MAX[channel.platform];
  const count = channel.platform === 'X' ? xLength : charCount;
  const yt = channel.platform === 'YOUTUBE';

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line p-3" data-testid={`options-${channel.id}`}>
      {ig && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium">Post as</span>
          <div className="inline-flex rounded-lg border border-line p-0.5" role="radiogroup" aria-label="Instagram post type">
            {(
              [
                ['post', 'Post / Reel', ImageIcon],
                ['story', 'Story', Smartphone],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={options.igType === value}
                disabled={disabled}
                onClick={() => onChange({ igType: value })}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] transition-colors disabled:opacity-50',
                  options.igType === value ? 'bg-fg text-canvas' : 'text-muted hover:text-fg',
                )}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted">Publishes as: {FORMAT_LABEL[format]}</span>
        </div>
      )}

      {story ? (
        <p className="rounded-md bg-subtle px-3 py-2 text-xs text-muted">
          A Story is one image or video (9:16 works best) and disappears after 24 hours. Captions, collaborators, tags and first comments aren&apos;t available for Stories
          through Instagram&apos;s API.
        </p>
      ) : (
        <>
          {ig && (
            <UsernameList
              icon={<Users className="size-4" />}
              label="Collaborators"
              hint="Invited accounts can accept to co-author the post; it then appears on their profile too."
              placeholder="username"
              values={options.collaborators}
              max={IG_MAX_COLLABORATORS}
              disabled={disabled}
              onChange={(collaborators) => onChange({ collaborators })}
            />
          )}

          {ig && media.length > 0 && <TagPeople options={options} media={media} isReel={isReel} disabled={disabled} onChange={onChange} />}

          {ig && isReel && (
            <div className="flex flex-col gap-2">
              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                <Clapperboard className="size-4" /> Reel settings
              </span>
              <label className="flex items-center gap-2 text-[13px]">
                <Switch checked={options.shareToFeed} onCheckedChange={(v) => onChange({ shareToFeed: v })} disabled={disabled} aria-label="Also share to feed" />
                Also show on the profile grid and feed
              </label>
              <label className="flex flex-wrap items-center gap-2 text-[13px]">
                Cover frame at
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  max={media[0]?.durationSec ?? undefined}
                  value={options.coverOffsetSec ?? ''}
                  onChange={(e) => onChange({ coverOffsetSec: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                  disabled={disabled}
                  placeholder="0"
                  className="h-8 w-24"
                  aria-label="Cover frame (seconds)"
                />
                seconds {media[0]?.durationSec ? <span className="text-xs text-muted">(video is {Math.round(media[0].durationSec)} s)</span> : null}
              </label>
            </div>
          )}

          {yt && <YouTubeFields options={options} caption={caption} disabled={disabled} onChange={onChange} format={format} />}

          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-[13px] font-medium">
              <MessageCircle className="size-4" /> {channel.platform === 'X' ? 'Reply to your post' : 'First comment'}
            </span>
            <Textarea
              value={options.firstComment}
              onChange={(e) => onChange({ firstComment: e.target.value })}
              readOnly={disabled}
              placeholder={COMMENT_HINT[channel.platform]}
              className="min-h-[64px]"
              aria-label={`First comment for ${channel.username ?? channel.name}`}
            />
            <span className={cn('self-end text-xs tabular-nums text-muted', count(options.firstComment) > commentMax && 'text-danger')}>
              {count(options.firstComment).toLocaleString()} / {commentMax.toLocaleString()}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/** YouTube upload settings: title, visibility, the required "made for kids" answer and tags. */
function YouTubeFields({
  options,
  caption,
  format,
  disabled,
  onChange,
}: {
  options: VersionOptions;
  caption: string;
  format: PostFormat;
  disabled: boolean;
  onChange: (patch: Partial<VersionOptions>) => void;
}) {
  const [tag, setTag] = useState('');
  const derived = youtubeTitle(caption, { ytTitle: '' });
  const addTag = () => {
    const t = tag.trim().replace(/^#/, '');
    if (!t || options.ytTags.includes(t)) return;
    onChange({ ytTags: [...options.ytTags, t] });
    setTag('');
  };
  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-1.5 text-[13px] font-medium">
        <Clapperboard className="size-4" /> YouTube {format === 'SHORT' ? 'Short' : 'video'} settings
      </span>
      {format === 'SHORT' && <p className="-mt-1 text-xs text-muted">Vertical and up to 3 minutes, so YouTube shows it as a Short.</p>}
      <label className="flex flex-col gap-1 text-[13px]">
        Title
        <Input
          value={options.ytTitle}
          onChange={(e) => onChange({ ytTitle: e.target.value })}
          readOnly={disabled}
          maxLength={200}
          placeholder={derived ? `Defaults to: ${derived}` : 'Video title (required)'}
          aria-label="YouTube title"
        />
        <span className={cn('self-end text-xs tabular-nums text-muted', charCount(options.ytTitle) > YT_TITLE_MAX && 'text-danger')}>
          {charCount(options.ytTitle)} / {YT_TITLE_MAX}
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span>Visibility</span>
        <div className="inline-flex rounded-lg border border-line p-0.5" role="radiogroup" aria-label="YouTube visibility">
          {(['public', 'unlisted', 'private'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={options.ytPrivacy === v}
              disabled={disabled}
              onClick={() => onChange({ ytPrivacy: v })}
              className={cn('rounded-md px-2.5 py-1 capitalize transition-colors disabled:opacity-50', options.ytPrivacy === v ? 'bg-fg text-canvas' : 'text-muted hover:text-fg')}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <fieldset className="flex flex-col gap-1 text-[13px]">
        <legend className="mb-1">Is this video made for kids? (required by YouTube)</legend>
        {[
          [false, 'No, it’s not made for kids'],
          [true, 'Yes, it’s made for kids'],
        ].map(([value, label]) => (
          <label key={String(value)} className="flex items-center gap-2">
            <input type="radio" name="yt-kids" checked={options.ytMadeForKids === value} disabled={disabled} onChange={() => onChange({ ytMadeForKids: value as boolean })} className="accent-[rgb(var(--accent-ink))]" />
            {label as string}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1.5 text-[13px]">
        Tags
        <div className="flex flex-wrap items-center gap-1.5">
          {options.ytTags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-subtle py-0.5 pl-2 pr-1">
              {t}
              {!disabled && (
                <button type="button" onClick={() => onChange({ ytTags: options.ytTags.filter((x) => x !== t) })} className="rounded-full p-0.5 hover:bg-hover" aria-label={`Remove tag ${t}`}>
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
          {!disabled && (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                addTag();
              }}
            >
              <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="tag" className="h-8 w-36" aria-label="Add YouTube tag" maxLength={100} />
              <Button type="submit" size="sm" variant="outline" disabled={!tag.trim()}>
                <Plus /> Add
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function UsernameList({
  icon,
  label,
  hint,
  placeholder,
  values,
  max,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  placeholder: string;
  values: string[];
  max: number;
  disabled: boolean;
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const name = cleanUsername(draft);
  const invalid = draft.trim() !== '' && !USERNAME.test(name);
  const add = () => {
    if (!name || invalid || values.includes(name) || values.length >= max) return;
    onChange([...values, name]);
    setDraft('');
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-[13px] font-medium">
        {icon} {label} <span className="font-normal text-muted">({values.length}/{max})</span>
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-subtle py-0.5 pl-2 pr-1 text-[13px]">
            @{v}
            {!disabled && (
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="rounded-full p-0.5 hover:bg-hover" aria-label={`Remove ${v}`}>
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && values.length < max && (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <div className="relative">
              <AtSign className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} className="h-8 w-40 pl-7" aria-label={`Add ${label.toLowerCase()}`} aria-invalid={invalid} />
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={!name || invalid}>
              <UserPlus /> Invite
            </Button>
          </form>
        )}
      </div>
      {invalid ? <span className="text-xs text-danger">Use letters, numbers, dots and underscores.</span> : <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

/**
 * Tag people: pick a photo, click where the person is, type their username. On a Reel only the
 * usernames are sent (Instagram doesn't position tags on videos).
 */
function TagPeople({ options, media, isReel, disabled, onChange }: { options: VersionOptions; media: MediaDto[]; isReel: boolean; disabled: boolean; onChange: (patch: Partial<VersionOptions>) => void }) {
  const taggable = isReel ? media.slice(0, 1) : media.filter((m) => m.kind === 'IMAGE');
  const [selected, setSelected] = useState<string | null>(null);
  const current = taggable.find((m) => m.id === selected) ?? taggable[0];
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });
  const [draft, setDraft] = useState('');
  if (!current) return null;
  const firstId = media[0]?.id;
  const tagsHere = options.userTags.filter((t) => (t.mediaId ?? firstId) === current.id);
  const name = cleanUsername(draft);
  const invalid = draft.trim() !== '' && !USERNAME.test(name);
  const full = options.userTags.length >= IG_MAX_USER_TAGS;

  const add = () => {
    if (!name || invalid || full || tagsHere.some((t) => t.username === name)) return;
    const tag: UserTag = { username: name, mediaId: current.id, x: isReel ? 0.5 : pos.x, y: isReel ? 0.5 : pos.y };
    onChange({ userTags: [...options.userTags, tag] });
    setDraft('');
  };
  const remove = (t: UserTag) => onChange({ userTags: options.userTags.filter((x) => x !== t) });

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-[13px] font-medium">
        <AtSign className="size-4" /> Tag people{' '}
        <span className="font-normal text-muted">
          ({options.userTags.length}/{IG_MAX_USER_TAGS})
        </span>
      </span>
      {taggable.length > 1 && (
        <div className="flex gap-1.5">
          {taggable.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelected(m.id)}
              className={cn('size-10 overflow-hidden rounded-md border-2', m.id === current.id ? 'border-fg' : 'border-transparent opacity-70')}
              aria-label={`Tag on item ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.thumbUrl ?? m.url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-start gap-3">
        {!isReel && (
          <div
            className={cn('relative w-40 overflow-hidden rounded-md bg-subtle', !disabled && 'cursor-crosshair')}
            onClick={(e) => {
              if (disabled) return;
              const r = e.currentTarget.getBoundingClientRect();
              setPos({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
            }}
            role="presentation"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.thumbUrl ?? current.url} alt="Click to place a tag" className="block w-full select-none" draggable={false} />
            {tagsHere.map((t) => (
              <span
                key={t.username}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-black/75 px-1 text-[10px] text-white"
                style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
              >
                @{t.username}
              </span>
            ))}
            {!disabled && <span className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent-ink shadow" style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }} />}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {!disabled && !full && (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <div className="relative">
                <AtSign className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="username" className="h-8 w-40 pl-7" aria-label="Tag a person" aria-invalid={invalid} />
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={!name || invalid}>
                <Plus /> Tag
              </Button>
            </form>
          )}
          <span className="text-xs text-muted">{isReel ? 'Tagged people are listed on the Reel.' : 'Click the photo to choose where the tag goes, then add the username.'}</span>
          <div className="flex flex-wrap gap-1.5">
            {tagsHere.map((t) => (
              <span key={t.username} className="inline-flex items-center gap-1 rounded-full bg-subtle py-0.5 pl-2 pr-1 text-[13px]">
                @{t.username}
                {!disabled && (
                  <button type="button" onClick={() => remove(t)} className="rounded-full p-0.5 hover:bg-hover" aria-label={`Remove tag ${t.username}`}>
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
