/** Thin fetch wrapper for the app's JSON route handlers. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }

  /** Field errors from a Zod `flatten()` payload, if present. */
  get fieldErrors(): Record<string, string[] | undefined> {
    const d = this.details as { fieldErrors?: Record<string, string[]> } | undefined;
    return d?.fieldErrors ?? {};
  }
}

export async function api<T = unknown>(url: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const res = await fetch(url, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: init.body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
    signal: init.signal,
    credentials: 'same-origin',
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const fields = Object.entries(err.fieldErrors)
      .map(([k, v]) => (v?.length ? `${k}: ${v[0]}` : null))
      .filter(Boolean);
    return fields.length && err.code === 'validation_error' ? `${err.message} ${fields.join('; ')}` : err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
