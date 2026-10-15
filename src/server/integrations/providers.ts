import { PLATFORM_PROVIDER, type Platform, type Provider } from '@/lib/platforms';
import { env } from '../env';
import { googleProvider } from './google-oauth';
import { linkedinProvider } from './linkedin-oauth';
import { metaProvider } from './meta-oauth';
import { xProvider } from './x-oauth';
import type { OAuthProvider } from './types';

export const PROVIDERS: Record<Provider, OAuthProvider> = { meta: metaProvider, x: xProvider, google: googleProvider, linkedin: linkedinProvider };

export const isProvider = (p: string): p is Provider => p in PROVIDERS;

export const providerFor = (platform: Platform) => PROVIDERS[PLATFORM_PROVIDER[platform]];

/** META_MODE=mock switches every platform to simulated channels (local development and tests). */
export const mockMode = () => env().META_MODE === 'mock';

/** How a new connection on this platform is made: simulated, Meta development mode, or live. */
export function platformMode(platform: Platform): 'MOCK' | 'DEVELOPMENT' | 'LIVE' {
  if (mockMode()) return 'MOCK';
  if (PLATFORM_PROVIDER[platform] === 'meta') return env().META_MODE === 'live' ? 'LIVE' : 'DEVELOPMENT';
  return 'LIVE';
}

/** Whether people can connect this platform on this server. */
export const platformAvailable = (platform: Platform) => mockMode() || providerFor(platform).configured();
