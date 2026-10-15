import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/server/env';
import { db } from '@/server/db';
import { parseSignedRequest } from '@/server/integrations/meta-signed-request';
import { revokeMetaUser } from '@/server/services/meta-compliance';

/** Meta "Data Deletion Request Callback". Configure in the Meta app's settings. */
export async function POST(req: NextRequest) {
  const secret = env().META_APP_SECRET;
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 404 });
  const form = await req.formData();
  const data = parseSignedRequest(String(form.get('signed_request') ?? ''), secret);
  if (!data || typeof data.user_id !== 'string') return NextResponse.json({ error: 'invalid signed_request' }, { status: 400 });
  const { confirmationCode } = await revokeMetaUser(data.user_id, 'data_deletion');
  await db.webhookEvent.create({
    data: { provider: 'meta', eventId: `deletion-${confirmationCode}`, type: 'data_deletion', payload: { user_id: data.user_id }, signatureValid: true, processedAt: new Date() },
  });
  return NextResponse.json({ url: `${env().APP_URL}/legal/data-deletion?code=${confirmationCode}`, confirmation_code: confirmationCode });
}
