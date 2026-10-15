import { env } from '../env';
import { GraphClient } from './meta/graph';
import { FacebookAdapter } from './meta/facebook';
import { InstagramAdapter } from './meta/instagram';
import { MockAdapter } from './mock';
import type { Platform, SocialAdapter } from './types';

let graph: GraphClient | undefined;

export function graphClient(): GraphClient {
  if (!graph) graph = new GraphClient({ version: env().META_GRAPH_VERSION, appSecret: env().META_APP_SECRET });
  return graph;
}

const mocks: Record<Platform, MockAdapter> = { INSTAGRAM: new MockAdapter('INSTAGRAM'), FACEBOOK: new MockAdapter('FACEBOOK') };
let real: Record<Platform, SocialAdapter> | undefined;

/**
 * Adapter for an account. MOCK accounts always get the mock adapter, so a mock channel created
 * in development can never reach a real platform even if META_MODE changes.
 */
export function adapterFor(account: { platform: Platform; mode: 'MOCK' | 'DEVELOPMENT' | 'LIVE' }): SocialAdapter {
  if (account.mode === 'MOCK') return mocks[account.platform];
  if (!real) real = { INSTAGRAM: new InstagramAdapter(graphClient()), FACEBOOK: new FacebookAdapter(graphClient()) };
  return real[account.platform];
}

/** For tests: replace the real adapters (e.g. with ones using a fake fetch). */
export function setAdaptersForTesting(adapters: Record<Platform, SocialAdapter> | undefined) {
  real = adapters;
}
