/** A scriptable stand-in for graph.facebook.com used by adapter tests. */
export type Handler = (req: { method: string; path: string; params: URLSearchParams }) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;

export function fakeGraph(routes: [string, RegExp, Handler][]) {
  const calls: { method: string; path: string; params: URLSearchParams }[] = [];
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const path = url.pathname.replace(/^\/v[\d.]+\//, '');
    const params = method === 'GET' ? url.searchParams : new URLSearchParams(String(init?.body ?? ''));
    calls.push({ method, path, params });
    const route = routes.find(([m, re]) => m === method && re.test(path));
    if (!route) return new Response(JSON.stringify({ error: { message: `No fake for ${method} ${path}`, code: 100 } }), { status: 400 });
    const res = await route[2]({ method, path, params });
    return new Response(JSON.stringify(res.body), { status: res.status ?? 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}
