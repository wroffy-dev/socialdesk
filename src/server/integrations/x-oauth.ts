import { env } from '../env';
import { expiresAt, type Discovery, type OAuthProvider, type TokenSet } from './types';
import { oauthFetch, oauthHttp } from './oauth-http';

/** OAuth 2.0 scopes for X. offline.access returns a refresh token (access tokens last 2 hours). */
export const X_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'];

export const xRedirectUri = () => `${env().APP_URL}/api/oauth/x/callback`;

const basic = () => `Basic ${Buffer.from(`${env().X_CLIENT_ID}:${env().X_CLIENT_SECRET}`).toString('base64')}`;

interface XToken {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

function toTokenSet(t: XToken): TokenSet {
  return { accessToken: t.access_token, refreshToken: t.refresh_token ?? null, expiresAt: expiresAt(t.expires_in), refreshTokenExpiresAt: null };
}

export const xProvider: OAuthProvider = {
  id: 'x',
  label: 'X',
  usesPkce: true,
  configured: () => !!env().X_CLIENT_ID && !!env().X_CLIENT_SECRET,
  authUrl(state, codeChallenge) {
    const url = new URL('https://x.com/i/oauth2/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', env().X_CLIENT_ID ?? '');
    url.searchParams.set('redirect_uri', xRedirectUri());
    url.searchParams.set('scope', X_SCOPES.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge ?? '');
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  },
  async discover(code, codeVerifier): Promise<Discovery> {
    const http = oauthHttp('X', oauthFetch());
    const tok = await http.request<XToken>({
      method: 'POST',
      url: 'https://api.x.com/2/oauth2/token',
      headers: { Authorization: basic() },
      form: { code, grant_type: 'authorization_code', redirect_uri: xRedirectUri(), code_verifier: codeVerifier, client_id: env().X_CLIENT_ID },
    });
    const t = tok.data;
    const granted = (t.scope ?? '').split(/[\s,]+/).filter(Boolean);
    const me = await http.request<{ data: { id: string; name: string; username: string; profile_image_url?: string } }>({
      method: 'GET',
      url: 'https://api.x.com/2/users/me',
      token: t.access_token,
      query: { 'user.fields': 'profile_image_url' },
    });
    const u = me.data.data;
    const set = toTokenSet(t);
    return {
      signedInAs: `@${u.username}`,
      declined: X_SCOPES.filter((s) => !granted.includes(s)),
      accounts: [
        {
          key: `X:${u.id}`,
          platform: 'X',
          externalId: u.id,
          name: u.name,
          username: u.username,
          avatarUrl: u.profile_image_url ?? null,
          accessToken: set.accessToken,
          tokenExpiresAt: set.expiresAt,
          refreshToken: set.refreshToken,
          refreshTokenExpiresAt: null,
          scopes: granted,
          metadata: { username: u.username },
          blockedReason: null,
        },
      ],
    };
  },
  async refresh(refreshToken) {
    const res = await oauthHttp('X', oauthFetch()).request<XToken>({
      method: 'POST',
      url: 'https://api.x.com/2/oauth2/token',
      headers: { Authorization: basic() },
      form: { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: env().X_CLIENT_ID },
    });
    return toTokenSet(res.data);
  },
};
