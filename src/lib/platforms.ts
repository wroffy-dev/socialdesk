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
  INSTAGRAM: { label: 'Instagram', color: '#d6287a', maxChars: 2200, formats: ['FEED', 'CAROUSEL', 'REEL'] },
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

/** Picks the format the content implies. */
export function inferFormat(platform: Platform, content: VersionContent): PostFormat {
  const { media } = content;
  if (platform === 'INSTAGRAM') {
    if (media.length > 1) return 'CAROUSEL';
    if (media[0]?.kind === 'VIDEO') return 'REEL';
    return 'FEED';
  }
  if (media.length === 0) return content.linkUrl ? 'LINK' : 'TEXT';
  if (media.some((m) => m.kind === 'VIDEO')) return 'REEL';
  return 'FEED';
}

function validateInstagram(c: VersionContent): Issue[] {
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
  return issues;
}

function validateFacebook(c: VersionContent): Issue[] {
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
  return issues;
}

export function validateVersion(platform: Platform, content: VersionContent): Issue[] {
  return platform === 'INSTAGRAM' ? validateInstagram(content) : validateFacebook(content);
}

export const errorsOnly = (issues: Issue[]) => issues.filter((i) => i.severity === 'error');
