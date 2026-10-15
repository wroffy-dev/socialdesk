import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { db } from '@/server/db';
import { deleteMedia, getMediaAsset, ingestUpload, listMedia, signedMediaUrl, verifyMediaSignature } from '@/server/services/media';
import { storage } from '@/server/storage';
import { createPost } from '@/server/services/posts';
import { addMember, makeChannel, makeWorkspace } from './helpers/factories';
import { tempFile, uploadImage } from './helpers/media';

describe('media library', () => {
  it('stores an image with dimensions, checksum and thumbnail', async () => {
    const { ctx } = await makeWorkspace('Media Co');
    const m = await uploadImage(ctx, 1200, 1500);
    expect(m).toMatchObject({ kind: 'IMAGE', mimeType: 'image/jpeg', width: 1200, height: 1500 });
    const row = await db.mediaAsset.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.storageKey.startsWith(`ws/${ctx.workspace.id}/`)).toBe(true);
    expect(await storage().size(row.storageKey)).toBeGreaterThan(0);
    expect(await storage().size(`${row.storageKey}.thumb.webp`)).toBeGreaterThan(0);
  });

  it('detects the real type from file contents, not the name', async () => {
    const { ctx } = await makeWorkspace('Sniff Co');
    const png = await sharp({ create: { width: 10, height: 10, channels: 4, background: '#fff' } }).png().toBuffer();
    const m = await ingestUpload(ctx, { tempPath: await tempFile('fake.jpg', png), originalName: 'fake.jpg', sizeBytes: png.length });
    expect(m.mimeType).toBe('image/png');

    const text = Buffer.from('<script>alert(1)</script>');
    await expect(
      ingestUpload(ctx, { tempPath: await tempFile('evil.jpg', text), originalName: 'evil.jpg', sizeBytes: text.length }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects oversized files', async () => {
    const { ctx } = await makeWorkspace('Big Co');
    const data = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).jpeg().toBuffer();
    await expect(
      ingestUpload(ctx, { tempPath: await tempFile('a.jpg', data), originalName: 'a.jpg', sizeBytes: 50 * 1024 * 1024 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('analysts cannot upload', async () => {
    const { ws } = await makeWorkspace('Viewer Co');
    const analyst = await addMember(ws.id, 'ANALYST');
    await expect(uploadImage(analyst)).rejects.toMatchObject({ status: 403 });
  });

  it('is isolated per workspace', async () => {
    const a = await makeWorkspace('Media A');
    const b = await makeWorkspace('Media B');
    const m = await uploadImage(b.ctx);
    await expect(getMediaAsset(a.ctx, m.id)).rejects.toMatchObject({ status: 404 });
    await expect(deleteMedia(a.ctx, m.id)).rejects.toMatchObject({ status: 404 });
    expect((await listMedia(a.ctx, {})).items.find((i) => i.id === m.id)).toBeUndefined();
    // Using another workspace's media in a post is refused.
    const ch = await makeChannel(a.ws.id);
    await expect(
      createPost(a.ctx, { baseCaption: 'x', baseMediaIds: [m.id], versions: [{ socialAccountId: ch.id }] }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('refuses to delete media used by a draft', async () => {
    const { ws, ctx } = await makeWorkspace('Used Co');
    const ch = await makeChannel(ws.id);
    const m = await uploadImage(ctx);
    await createPost(ctx, { baseCaption: 'hi', baseMediaIds: [m.id], versions: [{ socialAccountId: ch.id }] });
    await expect(deleteMedia(ctx, m.id)).rejects.toMatchObject({ status: 409 });
  });

  it('signs public media URLs that expire', () => {
    const url = new URL(signedMediaUrl('media123', { format: 'jpeg', ttlSec: 60 }));
    const p = url.searchParams;
    expect(verifyMediaSignature('media123', p.get('exp'), p.get('f'), p.get('sig'))).toBe('jpeg');
    expect(verifyMediaSignature('other', p.get('exp'), p.get('f'), p.get('sig'))).toBeNull();
    expect(verifyMediaSignature('media123', p.get('exp'), 'original', p.get('sig'))).toBeNull();
    expect(verifyMediaSignature('media123', String(Math.floor(Date.now() / 1000) - 10), p.get('f'), p.get('sig'))).toBeNull();
  });
});
