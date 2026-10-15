import { expect, test } from '@playwright/test';
import { createWorkspace, signUp, verifyEmail } from './helpers';

test('sign up, verify, connect a channel and schedule a post', async ({ page }) => {
  const email = await signUp(page, { name: 'Asha Rao' });
  const slug = await createWorkspace(page, `Asha Studio ${Date.now() % 10000}`);
  await expect(page.getByRole('heading', { name: /Asha!/ })).toBeVisible();
  await expect(page.getByText('Get set up')).toBeVisible();
  await expect(page.getByText(/Verify your email to connect channels/)).toBeVisible();

  await verifyEmail(page, email);

  // Connect a mock Facebook Page through the full OAuth round trip.
  await page.goto(`/w/${slug}/channels`);
  await page.getByRole('button', { name: 'Connect channel' }).click();
  await page.locator('a[href*="platform=FACEBOOK"]').click();
  await page.waitForURL(/channels\/connect\?pending=/);
  await page.getByLabel('Connect Mock Facebook Page 1').click();
  await page.getByRole('button', { name: /Connect 1 account/ }).click();
  await page.waitForURL(/channels\?connected=/);
  await expect(page.getByText('Mock Facebook Page 1').first()).toBeVisible();

  // Compose and schedule.
  await page.goto(`/w/${slug}/compose`);
  // The only connected channel is preselected.
  await expect(page.getByRole('button', { name: /Mock Facebook Page 1/, pressed: true })).toBeVisible();
  await page.getByLabel('Caption').fill('Our first scheduled post from E2E');
  await expect(page.getByText('Ready')).toBeVisible();
  await page.getByRole('button', { name: /^Schedule$/ }).click();
  await page.getByRole('button', { name: /^Schedule for/ }).click();
  await page.waitForURL(/\/publish\/posts\//);
  await expect(page.getByText('Scheduled').first()).toBeVisible();

  // It shows up in the list view.
  await page.goto(`/w/${slug}/publish/posts?tab=scheduled`);
  await expect(page.getByText('Our first scheduled post from E2E')).toBeVisible();
});

test('composer blocks invalid Instagram posts', async ({ page }) => {
  const email = await signUp(page);
  const slug = await createWorkspace(page, `IG Check ${Date.now() % 10000}`);
  await verifyEmail(page, email);
  await page.goto(`/w/${slug}/channels`);
  await page.getByRole('button', { name: 'Connect channel' }).click();
  await page.locator('a[href*="platform=INSTAGRAM"]').click();
  await page.waitForURL(/channels\/connect\?pending=/);
  await page.getByLabel('Connect Mock Instagram 1').click();
  await page.getByRole('button', { name: /Connect 1 account/ }).click();
  await page.waitForURL(/channels\?connected=/);

  await page.goto(`/w/${slug}/compose`);
  await expect(page.getByRole('button', { name: /mock_ig_1/, pressed: true })).toBeVisible();
  await page.getByLabel('Caption').fill('Text only does not work on Instagram');
  await expect(page.getByText('Instagram needs at least one image or video.').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Schedule$/ })).toBeDisabled();
});
