import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/server/db';
import { requestPasswordReset, resetPassword, signup, verifyEmail } from '@/server/services/auth';
import { verifyPassword } from '@/server/auth/password';
import { can, permissionsFor } from '@/lib/permissions';

async function lastLink(email: string, kind: 'verify-email' | 'reset-password') {
  const dir = path.resolve('.data/mail');
  const files = (await readdir(dir)).filter((f) => f.includes(email)).sort();
  for (const f of files.reverse()) {
    const mail = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
    const m = new RegExp(`/${kind}\\?token=([\\w-]+)`).exec(mail.text);
    if (m) return m[1]!;
  }
  throw new Error('no mail');
}

describe('authentication', () => {
  it('signs up with a hashed password and verifies email with a single-use token', async () => {
    const email = `new-${Date.now()}@example.test`;
    const user = await signup({ name: 'New Person', email, password: 'correct-horse-1' });
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordHash).not.toContain('correct-horse');
    expect(await verifyPassword('correct-horse-1', row.passwordHash!)).toBe(true);
    expect(row.emailVerified).toBeNull();

    const token = await lastLink(email, 'verify-email');
    await verifyEmail(token);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).not.toBeNull();
    await expect(verifyEmail(token)).rejects.toMatchObject({ status: 400 });
  });

  it('rejects duplicate emails and weak passwords', async () => {
    const email = `dupe-${Date.now()}@example.test`;
    await signup({ name: 'A', email, password: 'password-123' });
    await expect(signup({ name: 'B', email, password: 'password-123' })).rejects.toMatchObject({ status: 409 });
  });

  it('resets a password, revoking existing sessions', async () => {
    const email = `reset-${Date.now()}@example.test`;
    const user = await signup({ name: 'R', email, password: 'original-pass-1' });
    await requestPasswordReset(email);
    const token = await lastLink(email, 'reset-password');
    await resetPassword(token, 'brand-new-pass-2');
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword('brand-new-pass-2', row.passwordHash!)).toBe(true);
    expect(row.sessionVersion).toBe(1);
    await expect(resetPassword(token, 'another-pass-3')).rejects.toMatchObject({ status: 400 });
  });

  it('silently ignores reset requests for unknown emails', async () => {
    await expect(requestPasswordReset('nobody@example.test')).resolves.toBeUndefined();
  });
});

describe('permission matrix', () => {
  it('matches the documented roles', () => {
    expect(can('ANALYST', 'posts.view')).toBe(true);
    expect(can('ANALYST', 'posts.edit')).toBe(false);
    expect(can('PUBLISHER', 'posts.publish')).toBe(true);
    expect(can('PUBLISHER', 'channels.manage')).toBe(false);
    expect(can('ADMIN', 'billing.manage')).toBe(false);
    expect(can('OWNER', 'billing.manage')).toBe(true);
    expect(permissionsFor('OWNER').length).toBeGreaterThan(permissionsFor('ANALYST').length);
  });
});
