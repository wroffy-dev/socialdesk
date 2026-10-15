import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { WorkspaceCtx } from '@/server/auth/ctx';
import { ingestUpload } from '@/server/services/media';

const dir = path.resolve('.data/test-uploads');

export async function tempFile(name: string, data: Buffer) {
  await mkdir(dir, { recursive: true });
  const p = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
  await writeFile(p, data);
  return p;
}

export async function jpeg(width = 1080, height = 1080) {
  return sharp({ create: { width, height, channels: 3, background: '#88cc88' } }).jpeg().toBuffer();
}

export async function uploadImage(ctx: WorkspaceCtx, width = 1080, height = 1080) {
  const data = await jpeg(width, height);
  return ingestUpload(ctx, { tempPath: await tempFile('photo.jpg', data), originalName: 'photo.jpg', sizeBytes: data.length });
}
