import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@e2e.test`;
export const PASSWORD = 'e2e-password-123';

/** Reads the newest logged email to `email` and returns the first match of `pattern`. */
export async function linkFromMail(email: string, pattern: RegExp, timeoutMs = 15_000) {
  const dir = path.resolve('.data/mail');
  const safe = email.replace(/[^a-z0-9@._-]/gi, '_');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const files = (await readdir(dir)).filter((f) => f.includes(safe)).sort().reverse();
      for (const f of files) {
        const mail = JSON.parse(await readFile(path.join(dir, f), 'utf8')) as { text: string };
        const m = pattern.exec(mail.text);
        if (m) return m[0];
      }
    } catch {
      /* directory not created yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No mail to ${email} matching ${pattern}`);
}

export async function signUp(page: Page, opts: { name?: string; email?: string } = {}) {
  const email = opts.email ?? uniqueEmail('user');
  await page.goto('/signup');
  await page.getByLabel('Your name').fill(opts.name ?? 'E2E User');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/onboarding/);
  return email;
}

export async function createWorkspace(page: Page, name: string) {
  await page.getByLabel('Workspace name').fill(name);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL(/\/w\/[^/]+\/home/);
  return page.url().match(/\/w\/([^/]+)\//)![1]!;
}

export async function verifyEmail(page: Page, email: string) {
  const link = await linkFromMail(email, /http[^\s]+\/verify-email\?token=[\w-]+/);
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(page.getByText('Email verified')).toBeVisible();
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(w\/|onboarding)/);
}
