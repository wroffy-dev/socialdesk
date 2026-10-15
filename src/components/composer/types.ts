import type { MediaDto } from '@/server/services/media';
import type { PostDto } from '@/server/services/posts';

export type { MediaDto, PostDto };

export interface ComposerChannel {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  platform: 'INSTAGRAM' | 'FACEBOOK';
  status: 'CONNECTED' | 'NEEDS_REAUTH' | 'ERROR' | 'DISCONNECTED';
}

export interface ComposerTag {
  id: string;
  name: string;
  color: string;
}

export interface Override {
  caption: string;
  media: MediaDto[];
  linkUrl: string | null;
}

export interface ComposerState {
  selected: string[];
  baseCaption: string;
  baseMedia: MediaDto[];
  baseLinkUrl: string | null;
  overrides: Record<string, Override>;
  tagIds: string[];
  notes: string;
}

export type ScheduleAction =
  | { type: 'save' }
  | { type: 'draft' }
  | { type: 'publish_now' }
  | { type: 'queue' }
  | { type: 'schedule'; scheduledAt: string; timezone: string };
