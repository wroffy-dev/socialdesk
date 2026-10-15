import 'server-only';
import Busboy from 'busboy';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { createId } from '../ids';
import { badRequest } from '../errors';
import { tempDir } from '../storage';

export interface UploadedTemp {
  tempPath: string;
  originalName: string;
  sizeBytes: number;
}

/**
 * Streams a multipart upload (one "file" field) to a temp file without buffering it in memory,
 * aborting as soon as it exceeds `maxBytes`.
 */
export async function receiveUpload(req: Request, maxBytes: number): Promise<UploadedTemp> {
  const type = req.headers.get('content-type') ?? '';
  if (!type.startsWith('multipart/form-data') || !req.body) throw badRequest('Expected a multipart/form-data upload.');
  const dir = tempDir();
  await mkdir(dir, { recursive: true });

  return new Promise<UploadedTemp>((resolve, reject) => {
    const bb = Busboy({ headers: { 'content-type': type }, limits: { files: 1, fileSize: maxBytes, fields: 5 } });
    let result: UploadedTemp | null = null;
    let failed = false;
    let pending: Promise<void> | null = null;

    const fail = (err: Error, tempPath?: string) => {
      if (failed) return;
      failed = true;
      if (tempPath) void rm(tempPath, { force: true });
      reject(err);
    };

    bb.on('file', (field, stream, info) => {
      if (field !== 'file') {
        stream.resume();
        return;
      }
      const tempPath = path.join(dir, `${createId()}.upload`);
      let size = 0;
      const out = createWriteStream(tempPath);
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
      });
      stream.on('limit', () => fail(badRequest(`File is too large. The limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`), tempPath));
      pending = new Promise<void>((res) => {
        out.on('finish', () => {
          if (!failed) result = { tempPath, originalName: info.filename || 'upload', sizeBytes: size };
          res();
        });
        out.on('error', (err) => {
          fail(err, tempPath);
          res();
        });
      });
      stream.pipe(out);
    });
    bb.on('error', (err) => fail(err instanceof Error ? err : new Error(String(err))));
    bb.on('close', async () => {
      if (pending) await pending;
      if (failed) return;
      if (!result) reject(badRequest('No file was uploaded.'));
      else resolve(result);
    });

    Readable.fromWeb(req.body as unknown as WebReadableStream<Uint8Array>).pipe(bb);
  });
}
