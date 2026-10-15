import { createHmac } from 'node:crypto';
import { AdapterError, type FailureKind } from '../types';

export interface GraphConfig {
  version: string;
  appSecret?: string;
  /** Overridable for tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    is_transient?: boolean;
    error_user_msg?: string;
    error_user_title?: string;
    fbtrace_id?: string;
  };
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80004, 80005, 80006, 80008]);
const AUTH_CODES = new Set([190, 102, 463, 467]);
const PERMISSION_CODES = new Set([10, 200, 210, 220, 230, 270, 299]);

/** Maps a Graph API error to how the publisher should react. */
export function classifyGraphError(status: number, body: GraphErrorBody | null, mutating: boolean): AdapterError {
  const e = body?.error;
  const code = e?.code;
  const sub = e?.error_subcode;
  const message = e?.error_user_msg || e?.message || `Graph API request failed (${status})`;
  const tag = code ? `graph_${code}${sub ? `_${sub}` : ''}` : `http_${status}`;

  let kind: FailureKind;
  let retryAfter: number | undefined;
  if (code !== undefined && AUTH_CODES.has(code)) kind = 'auth';
  else if (code !== undefined && PERMISSION_CODES.has(code)) kind = 'auth';
  else if (code !== undefined && RATE_LIMIT_CODES.has(code)) {
    kind = 'transient';
    retryAfter = 15 * 60;
  } else if (code === 9007 || sub === 2207027) {
    // Instagram: media container not ready yet.
    kind = 'transient';
    retryAfter = 60;
  } else if (e?.is_transient || code === 1 || code === 2 || status >= 500) {
    // The request was received but failed server-side. For a publish call the outcome is unknown.
    kind = mutating ? 'ambiguous' : 'transient';
  } else {
    kind = 'permanent';
  }
  return new AdapterError(kind, message, tag, retryAfter, { status, error: e });
}

export class GraphClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly cfg: GraphConfig) {
    this.base = `https://graph.facebook.com/${cfg.version}`;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.timeoutMs = cfg.timeoutMs ?? 30_000;
  }

  /** appsecret_proof hardens server-to-server calls made with user/page tokens. */
  private proof(token: string) {
    return this.cfg.appSecret ? createHmac('sha256', this.cfg.appSecret).update(token).digest('hex') : undefined;
  }

  async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    opts: { token?: string; params?: Record<string, string | number | boolean | undefined>; finalCall?: boolean } = {},
  ): Promise<T> {
    const url = new URL(path.startsWith('http') ? path : `${this.base}/${path.replace(/^\//, '')}`);
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.params ?? {})) if (v !== undefined) params.set(k, String(v));
    if (opts.token) {
      params.set('access_token', opts.token);
      const proof = this.proof(opts.token);
      if (proof) params.set('appsecret_proof', proof);
    }
    const mutating = method !== 'GET';
    let body: string | undefined;
    if (method === 'GET') params.forEach((v, k) => url.searchParams.set(k, v));
    else body = params.toString();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        body,
        headers: body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      // No response. For the call that makes a post public we can't know whether it arrived.
      const timedOut = (err as Error)?.name === 'AbortError';
      throw new AdapterError(
        opts.finalCall ? 'ambiguous' : 'transient',
        timedOut ? 'The platform did not respond in time.' : 'Could not reach the platform.',
        timedOut ? 'timeout' : 'network',
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body */
    }
    if (!res.ok || (json && typeof json === 'object' && 'error' in json)) {
      const err = classifyGraphError(res.status, json as GraphErrorBody, mutating && !!opts.finalCall);
      if (res.status === 429) return Promise.reject(new AdapterError('transient', err.message, err.code, 15 * 60, err.raw));
      throw err;
    }
    return json as T;
  }

  get<T>(path: string, token?: string, params?: Record<string, string | number | boolean | undefined>) {
    return this.request<T>('GET', path, { token, params });
  }

  post<T>(path: string, token: string, params: Record<string, string | number | boolean | undefined>, finalCall = false) {
    return this.request<T>('POST', path, { token, params, finalCall });
  }
}
