import 'server-only';
import { Readable } from 'node:stream';
import { storage } from '../storage';

/** Streams a stored file with HTTP Range support (needed for video seeking). */
export async function serveStored(req: Request, key: string, mime: string, opts: { cache: string; filename?: string }) {
  const size = await storage().size(key);
  if (size === null) return new Response('Not found', { status: 404 });
  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': opts.cache,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  };
  if (opts.filename) headers['Content-Disposition'] = `inline; filename="${opts.filename.replace(/["\\\r\n]/g, '')}"`;

  const range = req.headers.get('range');
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    const body = Readable.toWeb(storage().read(key, { start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  const body = Readable.toWeb(storage().read(key)) as ReadableStream;
  return new Response(body, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
}
