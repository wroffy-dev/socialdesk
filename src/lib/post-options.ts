import { z } from 'zod';
import type { Platform } from './platforms';

/**
 * Per-channel publishing options, stored on each channel version (independent of whether its
 * caption/media are customised). Only options the platform supports are kept.
 */
const username = z
  .string()
  .trim()
  .transform((u) => u.replace(/^@+/, '').toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9._]{1,30}$/, 'Instagram usernames use letters, numbers, dots and underscores (max 30).'));

const coord = z.number().min(0).max(1);

export const userTagSchema = z.object({
  username,
  /** The tagged photo (or the Reel's video). null = the first item. */
  mediaId: z.string().max(40).nullable().default(null),
  x: coord.default(0.5),
  y: coord.default(0.5),
});

export const versionOptionsSchema = z.object({
  /** Instagram: a regular post (feed photo, carousel or Reel) or a Story. */
  igType: z.enum(['post', 'story']).default('post'),
  /** Instagram: up to 3 collaborators invited to co-author the post. */
  collaborators: z.array(username).max(10).default([]),
  /** Instagram: people tagged on a photo or Reel. */
  userTags: z.array(userTagSchema).max(40).default([]),
  /** Instagram Reels: also show the Reel on the profile grid / feed. */
  shareToFeed: z.boolean().default(true),
  /** Instagram Reels: frame used as the cover, in seconds from the start. */
  coverOffsetSec: z.number().min(0).max(15 * 60).nullable().default(null),
  /** Posted as a comment right after publishing (Instagram and Facebook). */
  firstComment: z.string().max(10_000).default(''),
});

export type VersionOptions = z.infer<typeof versionOptionsSchema>;
export type UserTag = z.infer<typeof userTagSchema>;

export const DEFAULT_OPTIONS: VersionOptions = versionOptionsSchema.parse({});

export const IG_MAX_COLLABORATORS = 3;
export const IG_MAX_USER_TAGS = 20;
export const IG_COMMENT_MAX = 2200;
export const FB_COMMENT_MAX = 8000;

/** Parses stored or submitted options and drops what the platform doesn't use. */
export function normalizeOptions(platform: Platform, raw: unknown): VersionOptions {
  const parsed = versionOptionsSchema.safeParse(raw ?? {});
  const o = parsed.success ? parsed.data : DEFAULT_OPTIONS;
  if (platform === 'FACEBOOK') return { ...DEFAULT_OPTIONS, firstComment: o.firstComment };
  // Stories support none of these, so they aren't stored or published with one.
  if (o.igType === 'story') return { ...DEFAULT_OPTIONS, igType: 'story' };
  const seen = new Set<string>();
  return {
    ...o,
    collaborators: [...new Set(o.collaborators)],
    userTags: o.userTags.filter((t) => {
      const key = `${t.mediaId ?? ''}:${t.username}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}

/** True when nothing differs from the defaults (used to keep stored rows small). */
export function isDefaultOptions(o: VersionOptions) {
  return JSON.stringify(o) === JSON.stringify(DEFAULT_OPTIONS);
}
