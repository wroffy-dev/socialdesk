import { HttpClient } from '../adapters/http';

/** HTTP client for OAuth token endpoints: reads `error_description` and treats invalid_grant as auth. */
export function oauthHttp(name: string, fetchImpl?: typeof fetch) {
  return new HttpClient(name, {
    fetchImpl,
    describeError: (status, body) => {
      const b = (body ?? {}) as { error?: string | { message?: string }; error_description?: string; message?: string; detail?: string };
      const err = typeof b.error === 'string' ? b.error : undefined;
      const message = b.error_description || (typeof b.error === 'object' ? b.error.message : undefined) || b.message || b.detail || err;
      return { message: message ? `${name}: ${message}` : undefined, code: err ? `oauth_${err}` : undefined, kind: err === 'invalid_grant' ? 'auth' : undefined };
    },
  });
}

/** Testing hook: lets tests route every OAuth request through a fake fetch. */
let fetchOverride: typeof fetch | undefined;
export function setOAuthFetchForTesting(f: typeof fetch | undefined) {
  fetchOverride = f;
}
export const oauthFetch = () => fetchOverride;
