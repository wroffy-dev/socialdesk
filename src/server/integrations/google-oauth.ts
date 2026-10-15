import { env } from '../env';
import { expiresAt, type Discovery, type OAuthProvider, type TokenSet } from './types';
import { oauthFetch, oauthHttp } from './oauth-http';

/** YouTube scopes: upload videos, read channel/video statistics, manage comments. */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

export const googleRedirectUri = () => `${env().APP_URL}/api/oauth/google/callback`;

interface GoogleToken {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

const toTokenSet = (t: GoogleToken, keepRefresh: string | null = null): TokenSet => ({
  accessToken: t.access_token,
  refreshToken: t.refresh_token ?? keepRefresh,
  expiresAt: expiresAt(t.expires_in),
  refreshTokenExpiresAt: null,
});

export const googleProvider: OAuthProvider = {
  id: 'google',
  label: 'Google',
  usesPkce: false,
  configured: () => !!env().GOOGLE_CLIENT_ID && !!env().GOOGLE_CLIENT_SECRET,
  authUrl(state) {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env().GOOGLE_CLIENT_ID ?? '');
    url.searchParams.set('redirect_uri', googleRedirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
    // offline + consent: always return a refresh token, even when reconnecting.
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('state', state);
    return url.toString();
  },
  async discover(code): Promise<Discovery> {
    const http = oauthHttp('Google', oauthFetch());
    const tok = await http.request<GoogleToken>({
      method: 'POST',
      url: 'https://oauth2.googleapis.com/token',
      form: { code, client_id: env().GOOGLE_CLIENT_ID, client_secret: env().GOOGLE_CLIENT_SECRET, redirect_uri: googleRedirectUri(), grant_type: 'authorization_code' },
    });
    const t = tok.data;
    const granted = (t.scope ?? '').split(/\s+/).filter(Boolean);
    const res = await http.request<{ items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url?: string } } } }[] }>({
      method: 'GET',
      url: 'https://www.googleapis.com/youtube/v3/channels',
      token: t.access_token,
      query: { part: 'snippet', mine: true },
    });
    const set = toTokenSet(t);
    const channels = res.data.items ?? [];
    return {
      signedInAs: channels[0]?.snippet.title ?? 'your Google account',
      declined: GOOGLE_SCOPES.filter((s) => !granted.includes(s)).map((s) => s.split('/').pop()!),
      accounts: channels.map((c) => ({
        key: `YOUTUBE:${c.id}`,
        platform: 'YOUTUBE' as const,
        externalId: c.id,
        name: c.snippet.title,
        username: c.snippet.customUrl?.replace(/^@/, '') ?? null,
        avatarUrl: c.snippet.thumbnails?.default?.url ?? null,
        accessToken: set.accessToken,
        tokenExpiresAt: set.expiresAt,
        refreshToken: set.refreshToken,
        refreshTokenExpiresAt: null,
        scopes: granted,
        metadata: {},
        blockedReason: set.refreshToken ? null : 'Google did not grant offline access. Remove SocialDesk from your Google account permissions and connect again.',
      })),
    };
  },
  async refresh(refreshToken) {
    const res = await oauthHttp('Google', oauthFetch()).request<GoogleToken>({
      method: 'POST',
      url: 'https://oauth2.googleapis.com/token',
      form: { client_id: env().GOOGLE_CLIENT_ID, client_secret: env().GOOGLE_CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' },
    });
    // Google keeps the same refresh token unless it sends a new one.
    return toTokenSet(res.data, refreshToken);
  },
};
