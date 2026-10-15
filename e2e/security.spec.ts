import { expect, test } from '@playwright/test';
import { createWorkspace, signUp } from './helpers';

test('protected pages redirect to sign in', async ({ page }) => {
  await page.goto('/w/anything/home');
  await expect(page).toHaveURL(/\/login/);
});

test('API requires a session', async ({ request }) => {
  const res = await request.get('/api/workspaces');
  expect(res.status()).toBe(401);
});

test('a user cannot read another workspace by URL or API', async ({ browser }) => {
  const a = await browser.newContext();
  const pageA = await a.newPage();
  await signUp(pageA);
  const slugA = await createWorkspace(pageA, `Tenant A ${Date.now() % 10000}`);
  const { workspaces } = await (await pageA.request.get('/api/workspaces')).json();
  const idA = workspaces[0].id as string;

  const b = await browser.newContext();
  const pageB = await b.newPage();
  await signUp(pageB);
  await createWorkspace(pageB, `Tenant B ${Date.now() % 10000}`);

  await pageB.goto(`/w/${slugA}/home`);
  await expect(pageB.getByText(/could not be found|404/i).first()).toBeVisible();
  for (const path of ['', '/posts', '/media', '/channels', '/members', '/insights', '/calendar?from=2026-01-01T00:00:00Z&to=2026-01-20T00:00:00Z']) {
    const res = await pageB.request.get(`/api/w/${idA}${path}`);
    expect(res.status(), path).toBe(404);
  }
  const write = await pageB.request.post(`/api/w/${idA}/posts`, { data: { baseCaption: 'x', versions: [] }, headers: { origin: 'http://localhost:3000' } });
  expect(write.status()).toBe(404);
  await a.close();
  await b.close();
});

test('cross-site POSTs are rejected', async ({ page }) => {
  await signUp(page);
  await createWorkspace(page, `CSRF ${Date.now() % 10000}`);
  const res = await page.request.post('/api/workspaces', { data: { name: 'Evil', timezone: 'UTC' }, headers: { origin: 'https://evil.example' } });
  expect(res.status()).toBe(403);
});

test('admin area is hidden from regular users', async ({ page }) => {
  await signUp(page);
  await createWorkspace(page, `NoAdmin ${Date.now() % 10000}`);
  const res = await page.goto('/admin');
  expect(res?.status()).toBe(404);
  const api = await page.request.get('/api/admin/audit');
  expect(api.status()).toBe(403);
});
