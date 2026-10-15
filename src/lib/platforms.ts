import { DEFAULT_OPTIONS, FB_COMMENT_MAX, IG_COMMENT_MAX, IG_MAX_COLLABORATORS, IG_MAX_USER_TAGS, type VersionOptions } from './post-options';

/**
 * Platform rules shared by the composer (instant feedback) and the server (authoritative check).
 * Limits follow Meta's published Content Publishing API constraints.
 */
export const PLATFORMS = ['INSTAGRAM', 'FACEBOOK'] as const;
export type Platform = (typeof PLATFORMS)[number];
export type PostFormat = 'FEED' | 'REEL' | 'STORY' | 'CAROUSEL' | 'TEXT' | 'LINK';

export interface PlatformInfo {
  label: string;
  color: string;
  maxChars: number;
  formats: PostFormat[];
}

export const PLATFORM_INFO: Record<Platform, PlatformInfo> = {
  INSTAGRAM: { label: 'Instagram', color: '#d6287a', maxChars: 2200, formats: ['FEED', 'CAROUSEL', 'REEL', 'STORY'] },
  FACEBOOK: { label: 'Facebook', color: '#1877f2', maxChars: 63206, formats: ['TEXT', 'LINK', 'FEED', 'REEL'] },
};

/** Shown in the UI as not yet available. Added later through the same adapter interface. */
export const COMING_SOON = [
  { key: 'threads', label: 'Threads', color: '#111111' },
  { key: 'linkedin', label: 'LinkedIn', color: '#0a66c2' },
  { key: 'bluesky', label: 'Bluesky', color: '#1185fe' },
  { key: 'pinterest', label: 'Pinterest', color: '#e60023' },
] as const;

export interface MediaFacts {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
}

export interface VersionContent {
  caption: string;
  media: MediaFacts[];
  linkUrl?: string | null;
}

export type Severity = 'error' | 'warning';
export interface Issue {
  severity: Severity;
  message: string;
}

const MB = 1024 * 1024;
const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu;
const MENTION = /(^|\s)@[\w.]+/g;

export const countHashtags = (text: string) => (text.match(HASHTAG) ?? []).length;
export const countMentions = (text: string) => (text.match(MENTION) ?? []).length;

/** Characters as platforms count them (user-perceived characters, so emoji count once). */
export function charCount(text: string) {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    let n = 0;
    for (const _ of new Intl.Segmenter().segment(text)) n++;
    return n;
  }
  return Array.from(text).length;
}

/** Picks the format the content (and, for Instagram, the chosen post type) implies. */
export function inferFormat(platform: Platform, content: VersionContent, options: Pick<VersionOptions, 'igType'> = DEFAULT_OPTIONS): PostFormat {
  const { media } = content;
  if (platform === 'INSTAGRAM') {
    if (options.igType === 'story') return 'STORY';
    if (media.length > 1) return 'CAROUSEL';
    if (media[0]?.kind === 'VIDEO') return 'REEL';
    return 'FEED';
  }
  if (media.length === 0) return content.linkUrl ? 'LINK' : 'TEXT';
  if (media.some((m) => m.kind === 'VIDEO')) return 'REEL';
  return 'FEED';
}

function validateInstagram(c: VersionContent, o: VersionOptions): Issue[] {
  if (o.igType === 'story') return validateInstagramStory(c, o);
  const issues: Issue[] = [];
  const err = (message: string) => issues.push({ severity: 'error', message });
  const warn = (message: string) => issues.push({ severity: 'warning', message });

  if (charCount(c.caption) > 2200) err(`Caption is ${charCount(c.caption).toLocaleString()} characters. Instagram allows 2,200.`);
  const tags = countHashtags(c.caption);
  if (tags > 30) err(`${tags} hashtags. Instagram allows 30.`);
  if (countMentions(c.caption) > 20) err('Instagram allows up to 20 @mentions.');
  if (c.media.length === 0) err('Instagram needs at least one image or video.');
  if (c.media.length > 10) err('Instagram carousels allow up to 10 items.');
  if (c.linkUrl) warn('Links in Instagram captions are not clickable.');

  for (const m of c.media) {
    if (m.kind === 'IMAGE') {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(m.mimeType)) err('Instagram images must be JPEG, PNG or WebP (converted to JPEG on publish).');
      if (m.sizeBytes > 8 * MB) err('Instagram images must be 8 MB or smaller.');
      if (m.width && m.height) {
        const ratio = m.width / m.height;
        if (c.media.length === 1 && (ratio < 0.8 - 0.005 || ratio > 1.91 + 0.005)) {
          err(`Image aspect ratio ${ratio.toFixed(2)}:1 is outside Instagram's 4:5 to 1.91:1 range.`);
        }
        if (m.width < 320) warn('Images narrower than 320px are upscaled by Instagram.');
      }
    } else {
      if (!['video/mp4', 'video/quicktime'].includes(m.mimeType)) err('Instagram videos must be MP4 or MOV.');
      if (m.durationSec != null) {
        if (m.durationSec < 3) err('Instagram videos must be at least 3 seconds long.');
        if (m.durationSec > 15 * 60) err('Instagram Reels can be at most 15 minutes long.');
        if (c.media.length > 1 && m.durationSec > 60) err('Videos in an Instagram carousel can be at most 60 seconds.');
      }
      if (m.sizeBytes > 1024 * MB) err('Instagram videos must be 1 GB or smaller.');
    }
  }

  // Collaborators, people tags and first comment.
  if (o.collaborators.length > IG_MAX_COLLABORATORS) err(`Instagram allows up to ${IG_MAX_COLLABORATORS} collaborators.`);
  if (o.userTags.length > IG_MAX_USER_TAGS) err(`Instagram allows up to ${IG_MAX_USER_TAGS} tagged people.`);
  const taggable = new Set(c.media.filter((m) => m.kind === 'IMAGE' || c.media.length === 1).map((m) => m.id));
  if (o.userTags.some((t) => t.mediaId && !taggable.has(t.mediaId))) {
    warn('A tagged item was removed or is a video inside a carousel; those tags will be skipped.');
  }
  issues.push(...validateFirstComment(o.firstComment, IG_COMMENT_MAX, true));
  if (o.coverOffsetSec != null && c.media.length === 1 && c.media[0]?.kind === 'VIDEO' && c.media[0].durationSec != null && o.coverOffsetSec > c.media[0].durationSec) {
    err('The Reel cover frame is after the end of the video.');
  }
  return issues;
}

function validateInstagramStory(c: VersionContent, o: VersionOptions): Issue[] {
  const issues: Issue[] = [];
  const err = (message: string) => issues.push({ severity: 'error', message });
  const warn = (message: string) => issues.push({ severity: 'warning', message });
  if (c.media.length !== 1) err('An Instagram Story needs exactly one image or video.');
  const m = c.media[0];
  if (m?.kind === 'IMAGE') {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(m.mimeType)) err('Story images must be JPEG, PNG or WebP (converted to JPEG on publish).');
    if (m.sizeBytes > 8 * MB) err('Story images must be 8 MB or smaller.');
  }
  if (m?.kind === 'VIDEO') {
    if (!['video/mp4', 'video/quicktime'].includes(m.mimeType)) err('Story videos must be MP4 or MOV.');
    if (m.durationSec != null && m.durationSec < 3) err('Story videos must be at least 3 seconds long.');
    if (m.durationSec != null && m.durationSec > 60) err('Story videos can be at most 60 seconds long.');
    if (m.sizeBytes > 100 * MB) err('Story videos must be 100 MB or smaller.');
  }
  if (m?.width && m.height && Math.abs(m.width / m.height - 9 / 16) > 0.1) warn('Stories are 9:16. Other shapes are shown with bars or cropped.');
  if (c.caption.trim()) warn('Captions are not shown on Stories.');
  if (c.linkUrl) warn('Link stickers cannot be added through the API; the link is ignored.');
  // Kept in the editor so switching back to a post restores them, but not published with a Story.
  const ignored = [o.collaborators.length && 'collaborators', o.userTags.length && 'tagged people', o.firstComment.trim() && 'the first comment'].filter(Boolean);
  if (ignored.length) warn(`Stories can’t have ${ignored.join(', ')}; ${ignored.length > 1 ? 'they are' : 'it is'} left out when posting a Story.`);
  return issues;
}

function validateFirstComment(text: string, max: number, instagram: boolean): Issue[] {
  const issues: Issue[] = [];
  const len = charCount(text);
  if (len > max) issues.push({ severity: 'error', message: `First comment is ${len.toLocaleString()} characters. The limit is ${max.toLocaleString()}.` });
  if (instagram && countHashtags(text) > 30) issues.push({ severity: 'error', message: 'Instagram allows 30 hashtags in a comment.' });
  return issues;
}

function validateFacebook(c: VersionContent, o: VersionOptions): Issue[] {
  const issues: Issue[] = [];
  const err = (message: string) => issues.push({ severity: 'error', message });
  const len = charCount(c.caption);
  if (len > 63206) err(`Post is ${len.toLocaleString()} characters. Facebook allows 63,206.`);
  if (c.caption.trim().length === 0 && c.media.length === 0 && !c.linkUrl) err('Facebook needs text, a link or media.');
  const videos = c.media.filter((m) => m.kind === 'VIDEO');
  if (videos.length > 1) err('Facebook posts can include only one video.');
  if (videos.length === 1 && c.media.length > 1) err("Facebook posts can't mix a video with photos.");
  if (c.media.length > 10) err('Facebook posts can include up to 10 photos here.');
  if (c.linkUrl && c.media.length > 0) issues.push({ severity: 'warning', message: 'With media attached, the link is posted in the text and no link preview is shown.' });
  for (const m of c.media) {
    if (m.kind === 'IMAGE' && m.sizeBytes > 10 * MB) err('Facebook photos must be 10 MB or smaller.');
    if (m.kind === 'VIDEO' && !['video/mp4', 'video/quicktime'].includes(m.mimeType)) err('Facebook videos must be MP4 or MOV.');
  }
  if (c.linkUrl && !/^https?:\/\//i.test(c.linkUrl)) err('Links must start with http:// or https://');
  issues.push(...validateFirstComment(o.firstComment, FB_COMMENT_MAX, false));
  return issues;
}

export function validateVersion(platform: Platform, content: VersionContent, options: VersionOptions = DEFAULT_OPTIONS): Issue[] {
  return platform === 'INSTAGRAM' ? validateInstagram(content, options) : validateFacebook(content, options);
}

export const errorsOnly = (issues: Issue[]) => issues.filter((i) => i.severity === 'error');
