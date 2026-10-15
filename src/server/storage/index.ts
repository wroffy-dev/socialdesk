import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { env } from '../env';

/**
 * Storage abstraction. Only the local driver exists today; an S3/R2 driver can implement the
 * same interface without touching callers.
 */
export interface StorageDriver {
  putFile(key: string, sourcePath: string): Promise<void>;
  putBuffer(key: string, data: Buffer): Promise<void>;
  read(key: string, range?: { start: number; end: number }): Readable;
  size(key: string): Promise<number | null>;
  delete(key: string): Promise<void>;
}

const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,250}$/;

class LocalStorage implements StorageDriver {
  constructor(private readonly root: string) {}

  /** Resolves a key to a path, refusing anything that escapes the storage root. */
  private resolve(key: string) {
    if (!KEY_RE.test(key) || key.includes('..')) throw new Error(`Invalid storage key: ${key}`);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Storage key escapes root');
    return full;
  }

  async putFile(key: string, sourcePath: string) {
    const dest = this.resolve(key);
    await mkdir(path.dirname(dest), { recursive: true });
    try {
      await rename(sourcePath, dest);
    } catch {
      await copyFile(sourcePath, dest);
      await rm(sourcePath, { force: true });
    }
  }

  async putBuffer(key: string, data: Buffer) {
    const dest = this.resolve(key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, data);
  }

  read(key: string, range?: { start: number; end: number }) {
    return createReadStream(this.resolve(key), range);
  }

  async size(key: string) {
    try {
      return (await stat(this.resolve(key))).size;
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  if (!driver) driver = new LocalStorage(path.resolve(env().STORAGE_LOCAL_DIR));
  return driver;
}

export function tempDir() {
  return path.resolve(env().STORAGE_LOCAL_DIR, '.tmp');
}

export async function streamToFile(stream: Readable, dest: string) {
  await mkdir(path.dirname(dest), { recursive: true });
  await pipeline(stream, createWriteStream(dest));
}
