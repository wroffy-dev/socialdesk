import type { Platform } from '@/lib/platforms';
import type { DiscoveredAccount, Discovery } from './types';

const NAMES: Record<Platform, (n: number) => { name: string; username: string | null }> = {
  INSTAGRAM: (n) => ({ name: `Mock Instagram ${n}`, username: `mock_ig_${n}` }),
  FACEBOOK: (n) => ({ name: `Mock Facebook Page ${n}`, username: null }),
  X: (n) => ({ name: `Mock X ${n}`, username: `mock_x_${n}` }),
  LINKEDIN: (n) => ({ name: n === 1 ? 'Mock LinkedIn Member' : `Mock LinkedIn Page ${n - 1}`, username: null }),
  YOUTUBE: (n) => ({ name: `Mock YouTube Channel ${n}`, username: `mockchannel${n}` }),
};

/**
 * Fake discovery used when META_MODE=mock (the switch covers every platform). Never contacts a
 * provider; tokens are placeholders and mock channels can only ever use the mock adapter.
 */
export function mockDiscovery(seed: string): Discovery {
  const mk = (platform: Platform, n: number): DiscoveredAccount => {
    const externalId = `mock-${platform.toLowerCase()}-${seed}-${n}`;
    return {
      key: `${platform}:${externalId}`,
      platform,
      externalId,
      ...NAMES[platform](n),
      avatarUrl: null,
      accessToken: 'mock-token',
      tokenExpiresAt: null,
      refreshToken: null,
      refreshTokenExpiresAt: null,
      scopes: [],
      metadata: platform === 'LINKEDIN' ? { mock: true, urn: n === 1 ? `urn:li:person:${externalId}` : `urn:li:organization:${externalId}` } : { mock: true },
      blockedReason: null,
    };
  };
  return {
    signedInAs: 'Mock User',
    declined: [],
    accounts: [
      mk('FACEBOOK', 1),
      mk('INSTAGRAM', 1),
      mk('FACEBOOK', 2),
      mk('X', 1),
      mk('X', 2),
      mk('LINKEDIN', 1),
      mk('LINKEDIN', 2),
      mk('YOUTUBE', 1),
      mk('YOUTUBE', 2),
    ],
  };
}
