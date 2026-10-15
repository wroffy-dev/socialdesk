import { env } from '../env';
import { AdapterError } from '../adapters/types';
import { graphClient } from '../adapters/registry';

/** Permissions requested from Meta. Each must be approved in App Review before going live. */
export const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_read_user_content',
  'pages_manage_engagement',
  'read_insights',
  'business_management',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
  'instagram_manage_insights',
];

export function metaRedirectUri() {
  return env().META_REDIRECT_URI || `${env().APP_URL}/api/oauth/meta/callback`;
}

export function metaAuthUrl(state: string) {
  const e = env();
  const url = new URL(`https://www.facebook.com/${e.META_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', e.META_APP_ID ?? '');
  url.searchParams.set('redirect_uri', metaRedirectUri());
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', META_SCOPES.join(','));
  // Lets users re-grant permissions they previously declined when reconnecting.
  url.searchParams.set('auth_type', 'rerequest');
  return url.toString();
}

export interface DiscoveredAccount {
  key: string;
  platform: 'INSTAGRAM' | 'FACEBOOK';
  externalId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  accessToken: string;
  tokenExpiresAt: string | null;
  scopes: string[];
  metadata: Record<string, unknown>;
  /** Reasons this account can't be connected (shown, not selectable). */
  blockedReason: string | null;
}

interface PageRow {
  id: string;
  name: string;
  access_token?: string;
  tasks?: string[];
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
}

/** Exchanges the OAuth code and lists the Pages and Instagram accounts the user can manage. */
export async function discoverMetaAccounts(code: string): Promise<{ fbUserId: string; fbUserName: string; accounts: DiscoveredAccount[]; declined: string[] }> {
  const e = env();
  const g = graphClient();
  const short = await g.get<{ access_token: string }>('oauth/access_token', undefined, {
    client_id: e.META_APP_ID,
    client_secret: e.META_APP_SECRET,
    redirect_uri: metaRedirectUri(),
    code,
  });
  const long = await g.get<{ access_token: string; expires_in?: number }>('oauth/access_token', undefined, {
    grant_type: 'fb_exchange_token',
    client_id: e.META_APP_ID,
    client_secret: e.META_APP_SECRET,
    fb_exchange_token: short.access_token,
  });
  const userToken = long.access_token;
  const [me, perms] = await Promise.all([
    g.get<{ id: string; name: string }>('me', userToken, { fields: 'id,name' }),
    g.get<{ data: { permission: string; status: string }[] }>('me/permissions', userToken),
  ]);
  const granted = perms.data.filter((p) => p.status === 'granted').map((p) => p.permission);
  const declined = perms.data.filter((p) => p.status === 'declined').map((p) => p.permission);

  const pages: PageRow[] = [];
  let next: string | undefined = 'me/accounts';
  let params: Record<string, string | number> | undefined = {
    fields: 'id,name,access_token,tasks,picture{url},instagram_business_account{id,username,name,profile_picture_url}',
    limit: 100,
  };
  for (let i = 0; next && i < 10; i++) {
    const res: { data: PageRow[]; paging?: { next?: string } } = await g.get(next, params ? userToken : undefined, params);
    pages.push(...res.data);
    next = res.paging?.next;
    params = undefined;
  }

  const accounts: DiscoveredAccount[] = [];
  for (const p of pages) {
    // Page tokens obtained from a long-lived user token do not expire.
    const canPublish = !p.tasks || p.tasks.includes('CREATE_CONTENT') || p.tasks.includes('MANAGE');
    if (p.access_token) {
      accounts.push({
        key: `FACEBOOK:${p.id}`,
        platform: 'FACEBOOK',
        externalId: p.id,
        name: p.name,
        username: null,
        avatarUrl: p.picture?.data?.url ?? null,
        accessToken: p.access_token,
        tokenExpiresAt: null,
        scopes: granted,
        metadata: { fbUserId: me.id, tasks: p.tasks ?? [] },
        blockedReason: canPublish ? null : 'Your role on this Page does not allow creating content.',
      });
    }
    const ig = p.instagram_business_account;
    if (ig && p.access_token) {
      accounts.push({
        key: `INSTAGRAM:${ig.id}`,
        platform: 'INSTAGRAM',
        externalId: ig.id,
        name: ig.name || ig.username || p.name,
        username: ig.username ?? null,
        avatarUrl: ig.profile_picture_url ?? null,
        accessToken: p.access_token,
        tokenExpiresAt: null,
        scopes: granted,
        metadata: { fbUserId: me.id, pageId: p.id, pageName: p.name },
        blockedReason: canPublish ? null : 'Your role on the linked Page does not allow creating content.',
      });
    }
  }
  return { fbUserId: me.id, fbUserName: me.name, accounts, declined };
}

/** Fake discovery used when META_MODE=mock. Never contacts Meta. */
export function mockDiscovery(seed: string): { fbUserId: string; fbUserName: string; accounts: DiscoveredAccount[]; declined: string[] } {
  const mk = (platform: 'INSTAGRAM' | 'FACEBOOK', n: number): DiscoveredAccount => ({
    key: `${platform}:mock-${platform.toLowerCase()}-${seed}-${n}`,
    platform,
    externalId: `mock-${platform.toLowerCase()}-${seed}-${n}`,
    name: platform === 'INSTAGRAM' ? `Mock Instagram ${n}` : `Mock Facebook Page ${n}`,
    username: platform === 'INSTAGRAM' ? `mock_ig_${n}` : null,
    avatarUrl: null,
    accessToken: 'mock-token',
    tokenExpiresAt: null,
    scopes: [],
    metadata: { mock: true },
    blockedReason: null,
  });
  return { fbUserId: 'mock-user', fbUserName: 'Mock User', accounts: [mk('FACEBOOK', 1), mk('INSTAGRAM', 1), mk('FACEBOOK', 2)], declined: [] };
}

export function isAuthError(err: unknown) {
  return err instanceof AdapterError && err.kind === 'auth';
}
