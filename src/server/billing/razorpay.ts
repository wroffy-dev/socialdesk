import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env';
import { badRequest } from '../errors';

const API = 'https://api.razorpay.com/v1';

function authHeader() {
  const e = env();
  if (!e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET) throw badRequest('Razorpay is not configured.');
  return `Basic ${Buffer.from(`${e.RAZORPAY_KEY_ID}:${e.RAZORPAY_KEY_SECRET}`).toString('base64')}`;
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, fetchImpl: typeof fetch = fetch): Promise<T> {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as { error?: { description?: string } } | null;
  if (!res.ok) throw badRequest(`Payment provider error: ${json?.error?.description ?? res.status}`);
  return json as T;
}

export interface RazorpaySubscription {
  id: string;
  plan_id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
  short_url?: string;
  notes?: Record<string, string>;
}

export function createSubscription(planId: string, notes: Record<string, string>) {
  // total_count is required by Razorpay; 120 monthly cycles ≈ 10 years, i.e. until cancelled.
  return call<RazorpaySubscription>('POST', '/subscriptions', { plan_id: planId, total_count: 120, customer_notify: 1, notes });
}

export function cancelSubscription(id: string, atCycleEnd: boolean) {
  return call<RazorpaySubscription>('POST', `/subscriptions/${id}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });
}

/** Webhook authenticity: HMAC-SHA256 of the raw body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
