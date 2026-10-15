import { env } from '../env';
import { GraphClient } from './meta/graph';
import { FacebookAdapter } from './meta/facebook';
import { InstagramAdapter } from './meta/instagram';
import { LinkedInAdapter } from './linkedin';
import { MockAdapter } from './mock';
import { XAdapter } from './x';
import { YouTubeAdapter } from './youtube';
import { PLATFORMS } from '@/lib/platforms';
import type { Platform, SocialAdapter } from './types';

let graph: GraphClient | undefined;

export function graphClient(): GraphClient {
  if (!graph) graph = new GraphClient({ version: env().META_GRAPH_VERSION, appSecret: env().META_APP_SECRET });
  return graph;
}

const mocks = Object.fromEntries(PLATFORMS.map((p) => [p, new MockAdapter(p)])) as Record<Platform, MockAdapter>;
let real: Partial<Record<Platform, SocialAdapter>> = {};
let overrides: Partial<Record<Platform, SocialAdapter>> | undefined;

function create(platform: Platform): SocialAdapter {
  switch (platform) {
    case 'INSTAGRAM':
      return new InstagramAdapter(graphClient());
    case 'FACEBOOK':
      return new FacebookAdapter(graphClient());
    case 'X':
      return new XAdapter();
    case 'LINKEDIN':
      return new LinkedInAdapter({ version: env().LINKEDIN_API_VERSION });
    case 'YOUTUBE':
      return new YouTubeAdapter();
  }
}

/**
 * Adapter for an account. MOCK accounts always get the mock adapter, so a mock channel created
 * in development can never reach a real platform even if META_MODE changes.
 */
export function adapterFor(account: { platform: Platform; mode: 'MOCK' | 'DEVELOPMENT' | 'LIVE' }): SocialAdapter {
  if (account.mode === 'MOCK') return mocks[account.platform];
  const o = overrides?.[account.platform];
  if (o) return o;
  return (real[account.platform] ??= create(account.platform));
}

/** For tests: replace real adapters (e.g. with ones using a fake fetch). */
export function setAdaptersForTesting(adapters: Partial<Record<Platform, SocialAdapter>> | undefined) {
  overrides = adapters;
  real = {};
}
