/** A scriptable fetch for REST adapters (X, LinkedIn, YouTube, OAuth endpoints). */
export interface FakeRequest {
  method: string;
  url: URL;
  headers: Headers;
  /** Parsed JSON body, form fields, raw bytes or FormData, depending on the request. */
  json: unknown;
  form: URLSearchParams | null;
  bytes: Uint8Array | null;
  formData: FormData | null;
}

export type FakeReply = { status?: number; body?: unknown; headers?: Record<string, string> };
export type FakeRoute = [method: string, match: RegExp, handler: (req: FakeRequest) => FakeReply | Promise<FakeReply>];

export function fakeHttp(routes: FakeRoute[]) {
  const calls: FakeRequest[] = [];
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body = init?.body;
    const req: FakeRequest = { method, url, headers, json: null, form: null, bytes: null, formData: null };
    if (typeof body === 'string') {
      if ((headers.get('content-type') ?? '').includes('json')) req.json = JSON.parse(body);
      else req.form = new URLSearchParams(body);
    } else if (body instanceof FormData) req.formData = body;
    else if (body instanceof Uint8Array) req.bytes = body;
    calls.push(req);
    const target = `${url.host}${url.pathname}`;
    const route = routes.find(([m, re]) => m === method && re.test(target));
    if (!route) return new Response(JSON.stringify({ message: `No fake for ${method} ${target}` }), { status: 400 });
    const r = await route[2](req);
    const status = r.status ?? 200;
    const payload = r.body === undefined ? null : typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(status === 204 || status === 308 ? (payload ?? null) : payload, { status, headers: r.headers });
  }) as typeof fetch;
  return { fetchImpl, calls };
}
