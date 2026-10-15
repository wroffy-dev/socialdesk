import { env } from '../env';
import { expiresAt, type DiscoveredAccount, type Discovery, type OAuthProvider, type TokenSet } from './types';
import { oauthFetch, oauthHttp } from './oauth-http';

const MEMBER_SCOPES = ['openid', 'profile', 'w_member_social'];
/** Page scopes need LinkedIn's Community Management API product (enable with LINKEDIN_PAGES=true). */
const PAGE_SCOPES = ['w_organization_social', 'r_organization_social', 'rw_organization_admin'];
/** Page roles that can create posts. */
const POSTING_ROLES = new Set(['ADMINISTRATOR', 'CONTENT_ADMINISTRATOR', 'DIRECT_SPONSORED_CONTENT_POSTER']);

export const linkedinScopes = () => (env().LINKEDIN_PAGES ? [...MEMBER_SCOPES, ...PAGE_SCOPES] : MEMBER_SCOPES);
export const linkedinRedirectUri = () => `${env().APP_URL}/api/oauth/linkedin/callback`;

interface LiToken {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

const toTokenSet = (t: LiToken): TokenSet => ({
  accessToken: t.access_token,
  refreshToken: t.refresh_token ?? null,
  expiresAt: expiresAt(t.expires_in),
  refreshTokenExpiresAt: expiresAt(t.refresh_token_expires_in),
});

export const linkedinProvider: OAuthProvider = {
  id: 'linkedin',
  label: 'LinkedIn',
  usesPkce: false,
  configured: () => !!env().LINKEDIN_CLIENT_ID && !!env().LINKEDIN_CLIENT_SECRET,
  authUrl(state) {
    const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', env().LINKEDIN_CLIENT_ID ?? '');
    url.searchParams.set('redirect_uri', linkedinRedirectUri());
    url.searchParams.set('state', state);
    url.searchParams.set('scope', linkedinScopes().join(' '));
    return url.toString();
  },
  async discover(code): Promise<Discovery> {
    const http = oauthHttp('LinkedIn', oauthFetch());
    const tok = await http.request<LiToken>({
      method: 'POST',
      url: 'https://www.linkedin.com/oauth/v2/accessToken',
      form: { grant_type: 'authorization_code', code, client_id: env().LINKEDIN_CLIENT_ID, client_secret: env().LINKEDIN_CLIENT_SECRET, redirect_uri: linkedinRedirectUri() },
    });
    const t = tok.data;
    const granted = (t.scope ?? '').split(/[\s,]+/).filter(Boolean);
    const set = toTokenSet(t);
    const me = await http.request<{ sub: string; name?: string; picture?: string }>({ method: 'GET', url: 'https://api.linkedin.com/v2/userinfo', token: t.access_token });
    const base = {
      accessToken: set.accessToken,
      tokenExpiresAt: set.expiresAt,
      refreshToken: set.refreshToken,
      refreshTokenExpiresAt: set.refreshTokenExpiresAt,
      scopes: granted,
    };
    const accounts: DiscoveredAccount[] = [
      {
        ...base,
        key: `LINKEDIN:person:${me.data.sub}`,
        platform: 'LINKEDIN',
        externalId: me.data.sub,
        name: me.data.name ?? 'LinkedIn member',
        username: null,
        avatarUrl: me.data.picture ?? null,
        metadata: { urn: `urn:li:person:${me.data.sub}`, kind: 'person' },
        blockedReason: granted.includes('w_member_social') ? null : 'Posting permission (w_member_social) was not granted.',
      },
    ];
    if (granted.includes('w_organization_social')) {
      const headers = { 'LinkedIn-Version': env().LINKEDIN_API_VERSION, 'X-Restli-Protocol-Version': '2.0.0' };
      const acls = await http.request<{ elements?: { organization: string; role: string; state: string }[] }>({
        method: 'GET',
        url: 'https://api.linkedin.com/rest/organizationAcls',
        token: t.access_token,
        headers,
        query: { q: 'roleAssignee', state: 'APPROVED', count: 100 },
      });
      const byOrg = new Map<string, string[]>();
      for (const a of acls.data.elements ?? []) byOrg.set(a.organization, [...(byOrg.get(a.organization) ?? []), a.role]);
      for (const [urn, roles] of byOrg) {
        const id = urn.split(':').pop()!;
        const org = await http
          .request<{ localizedName?: string; vanityName?: string }>({ method: 'GET', url: `https://api.linkedin.com/rest/organizations/${id}`, token: t.access_token, headers })
          .catch(() => null);
        accounts.push({
          ...base,
          key: `LINKEDIN:organization:${id}`,
          platform: 'LINKEDIN',
          externalId: id,
          name: org?.data.localizedName ?? `LinkedIn page ${id}`,
          username: org?.data.vanityName ?? null,
          avatarUrl: null,
          metadata: { urn, kind: 'organization', roles },
          blockedReason: roles.some((r) => POSTING_ROLES.has(r)) ? null : 'Your role on this page does not allow posting.',
        });
      }
    }
    return { signedInAs: me.data.name ?? 'LinkedIn member', declined: linkedinScopes().filter((s) => !granted.includes(s)), accounts };
  },
  async refresh(refreshToken) {
    const res = await oauthHttp('LinkedIn', oauthFetch()).request<LiToken>({
      method: 'POST',
      url: 'https://www.linkedin.com/oauth/v2/accessToken',
      form: { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: env().LINKEDIN_CLIENT_ID, client_secret: env().LINKEDIN_CLIENT_SECRET },
    });
    return toTokenSet(res.data);
  },
};
