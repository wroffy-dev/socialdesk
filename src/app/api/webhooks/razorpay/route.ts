import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { env } from '@/server/env';
import { db } from '@/server/db';
import { verifyWebhookSignature } from '@/server/billing/razorpay';
import { processRazorpayEvent } from '@/server/services/billing';

/**
 * Razorpay webhook. The raw body's HMAC is verified before anything is parsed or stored as
 * trusted; subscriptions change only here, never from the browser's checkout callback.
 */
export async function POST(req: NextRequest) {
  const secret = env().RAZORPAY_WEBHOOK_SECRET;
  if (!env().BILLING_ENABLED || !secret) return NextResponse.json({ error: 'billing disabled' }, { status: 404 });
  const raw = await req.text();
  const signature = req.headers.get('x-razorpay-signature');
  const eventId = req.headers.get('x-razorpay-event-id') ?? createHash('sha256').update(raw).digest('hex');
  if (!verifyWebhookSignature(raw, signature, secret)) {
    await db.webhookEvent
      .create({ data: { provider: 'razorpay', eventId: `invalid-${Date.now()}-${eventId.slice(0, 16)}`, type: 'invalid_signature', payload: {}, signatureValid: false } })
      .catch(() => undefined);
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  try {
    const res = await processRazorpayEvent(eventId, body);
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    console.error('[razorpay] webhook processing failed', err);
    // 500 makes Razorpay retry later.
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
