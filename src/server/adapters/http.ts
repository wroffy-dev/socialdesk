import { AdapterError, type FailureKind } from './types';

/**
 * Small JSON/REST client shared by the X, LinkedIn and YouTube adapters. It applies a timeout,
 * turns failures into AdapterErrors the publisher understands, and never follows redirects
 * (YouTube's resumable upload answers 308 to mean "keep going").
 */
export interface HttpClientConfig {
  /** Overridable for tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Platform-specific reading of an error response (message, code, and optionally the kind). */
  describeError?: (status: number, body: unknown, headers: Headers) => { message?: string; code?: string; kind?: FailureKind; retryAfterSec?: number };
}

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  token?: string;
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  form?: Record<string, string | undefined>;
  body?: Uint8Array | FormData;
  headers?: Record<string, string>;
  /** The request that makes a post public: if its outcome is unknown, so is the post's. */
  finalCall?: boolean;
  /** Non-2xx statuses that are part of the protocol rather than errors (e.g. 308). */
  okStatuses?: number[];
  timeoutMs?: number;
}

export interface HttpResponse<T> {
  status: number;
  headers: Headers;
  data: T;
}

function retryAfter(headers: Headers): number | undefined {
  const ra = headers.get('retry-after');
  if (ra && /^\d+$/.test(ra)) return Number(ra);
  const reset = headers.get('x-rate-limit-reset');
  if (reset && /^\d+$/.test(reset)) return Math.max(30, Number(reset) - Math.floor(Date.now() / 1000));
  return undefined;
}

export class HttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    private readonly platformName: string,
    private readonly cfg: HttpClientConfig = {},
  ) {
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.timeoutMs = cfg.timeoutMs ?? 30_000;
  }

  async request<T = unknown>(r: HttpRequest): Promise<HttpResponse<T>> {
    const url = new URL(r.url);
    for (const [k, v] of Object.entries(r.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { ...(r.headers ?? {}) };
    if (r.token) headers.Authorization = `Bearer ${r.token}`;
    let body: BodyInit | undefined;
    if (r.json !== undefined) {
      body = JSON.stringify(r.json);
      headers['Content-Type'] ??= 'application/json';
    } else if (r.form) {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(r.form)) if (v !== undefined) p.set(k, v);
      body = p.toString();
      headers['Content-Type'] ??= 'application/x-www-form-urlencoded';
    } else if (r.body) {
      body = r.body as BodyInit;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), r.timeoutMs ?? this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { method: r.method, headers, body, signal: controller.signal, redirect: 'manual' });
    } catch (err) {
      const timedOut = (err as Error)?.name === 'AbortError';
      throw new AdapterError(
        r.finalCall ? 'ambiguous' : 'transient',
        timedOut ? `${this.platformName} did not respond in time.` : `Could not reach ${this.platformName}.`,
        timedOut ? 'timeout' : 'network',
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (res.ok || r.okStatuses?.includes(res.status)) return { status: res.status, headers: res.headers, data: data as T };
    throw this.toError(res.status, data, res.headers, !!r.finalCall);
  }

  private toError(status: number, body: unknown, headers: Headers, finalCall: boolean): AdapterError {
    const d = this.cfg.describeError?.(status, body, headers) ?? {};
    const message = d.message || `${this.platformName} request failed (${status}).`;
    const code = d.code ?? `http_${status}`;
    let kind: FailureKind;
    if (d.kind) kind = d.kind;
    else if (status === 401) kind = 'auth';
    else if (status === 429) kind = 'transient';
    else if (status >= 500) kind = finalCall ? 'ambiguous' : 'transient';
    else kind = 'permanent';
    // A server error on the publishing call may still have published; a definite rejection hasn't.
    if (kind === 'transient' && finalCall && status >= 500) kind = 'ambiguous';
    return new AdapterError(kind, message, code, d.retryAfterSec ?? (status === 429 ? (retryAfter(headers) ?? 15 * 60) : undefined), { status, body });
  }
}
