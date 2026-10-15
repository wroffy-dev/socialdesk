import type { Platform, Provider } from '@/lib/platforms';

/** An account found during OAuth, before the user picks it. Tokens never reach the browser. */
export interface DiscoveredAccount {
  key: string;
  platform: Platform;
  externalId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  accessToken: string;
  tokenExpiresAt: string | null;
  refreshToken?: string | null;
  refreshTokenExpiresAt?: string | null;
  scopes: string[];
  metadata: Record<string, unknown>;
  /** Reasons this account can't be connected (shown, not selectable). */
  blockedReason: string | null;
}

export interface Discovery {
  /** Who signed in at the provider, shown on the account picker. */
  signedInAs: string;
  accounts: DiscoveredAccount[];
  /** Permissions the user declined. */
  declined: string[];
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  refreshTokenExpiresAt: string | null;
}

export interface OAuthProvider {
  id: Provider;
  /** Shown as "Signed in to {label}". */
  label: string;
  /** Whether the server has credentials for this provider. */
  configured(): boolean;
  /** X uses PKCE: the start of the flow creates a verifier and sends its challenge. */
  usesPkce: boolean;
  authUrl(state: string, codeChallenge?: string): string;
  discover(code: string, codeVerifier?: string): Promise<Discovery>;
  /** Exchanges a refresh token for a new access token (providers with short-lived tokens). */
  refresh?(refreshToken: string): Promise<TokenSet>;
}

/** Converts an OAuth `expires_in` (seconds) into an ISO timestamp. */
export const expiresAt = (seconds: number | undefined | null) => (seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null);
