import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/server/env';
import { parseSignedRequest } from '@/server/integrations/meta-signed-request';
import { revokeMetaUser } from '@/server/services/meta-compliance';

/** Meta "Deauthorize Callback URL": the user removed the app from their Facebook account. */
export async function POST(req: NextRequest) {
  const secret = env().META_APP_SECRET;
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 404 });
  const form = await req.formData();
  const data = parseSignedRequest(String(form.get('signed_request') ?? ''), secret);
  if (!data || typeof data.user_id !== 'string') return NextResponse.json({ error: 'invalid signed_request' }, { status: 400 });
  await revokeMetaUser(data.user_id, 'deauthorize');
  return NextResponse.json({ ok: true });
}
