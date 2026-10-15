import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/server/db';
import { ensureJpeg, verifyMediaSignature } from '@/server/services/media';
import { serveStored } from '@/server/media/serve';

/**
 * Signed, expiring URL used by social platforms to download media during publishing.
 * No session is involved; access requires a valid HMAC signature.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  const sp = req.nextUrl.searchParams;
  const format = verifyMediaSignature(mediaId, sp.get('exp'), sp.get('f'), sp.get('sig'));
  if (!format) return NextResponse.json({ error: { code: 'forbidden', message: 'Invalid or expired link.' } }, { status: 403 });
  const asset = await db.mediaAsset.findFirst({ where: { id: mediaId, deletedAt: null } });
  if (!asset) return NextResponse.json({ error: { code: 'not_found', message: 'Not found.' } }, { status: 404 });
  if (format === 'jpeg' && asset.kind === 'IMAGE') {
    const { key, mime } = await ensureJpeg(asset);
    return serveStored(req, key, mime, { cache: 'private, max-age=600' });
  }
  return serveStored(req, asset.storageKey, asset.mimeType, { cache: 'private, max-age=600' });
}
