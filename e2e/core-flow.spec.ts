import { expect, test } from '@playwright/test';
import { createWorkspace, signUp, verifyEmail } from './helpers';

test('sign up, verify, connect a channel to a project and schedule a post', async ({ page }) => {
  const email = await signUp(page, { name: 'Asha Rao' });
  const slug = await createWorkspace(page, `Asha Studio ${Date.now() % 10000}`);
  await expect(page.getByRole('heading', { name: /Asha!/ })).toBeVisible();
  await expect(page.getByText('Get set up')).toBeVisible();
  await expect(page.getByText(/Verify your email to connect channels/)).toBeVisible();

  await verifyEmail(page, email);

  // The workspace starts with one project; connect a mock Facebook Page to it through the full OAuth round trip.
  await page.goto(`/w/${slug}/channels`);
  await expect(page.getByText(/1 of 2 projects used/)).toBeVisible();
  await page.getByTestId('project-card').first().locator('a[href*="platform=FACEBOOK"]').click();
  await page.waitForURL(/channels\/connect\?pending=/);
  await page.getByLabel('Connect Mock Facebook Page 1').check();
  await page.getByRole('button', { name: /^Link to / }).click();
  await page.waitForURL(/channels\?connected=/);
  await expect(page.getByText('Mock Facebook Page 1').first()).toBeVisible();

  // A second project; the Free plan stops at two.
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Project name').fill('Second Brand');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: 'Second Brand' })).toBeVisible();
  await expect(page.getByText(/2 of 2 projects used/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'New project' })).toBeDisabled();
  // The same Page can't be linked to the second project too.
  await page.getByTestId('project-card').nth(1).locator('a[href*="platform=FACEBOOK"]').click();
  await page.waitForURL(/channels\/connect\?pending=/);
  await expect(page.getByLabel('Connect Mock Facebook Page 1')).toBeDisabled();
  await expect(page.getByText(/Already linked to the project/)).toBeVisible();

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
  await page.getByTestId('project-card').first().locator('a[href*="platform=INSTAGRAM"]').click();
  await page.waitForURL(/channels\/connect\?pending=/);
  await page.getByLabel('Connect Mock Instagram 1').check();
  await page.getByRole('button', { name: /^Link to / }).click();
  await page.waitForURL(/channels\?connected=/);

  await page.goto(`/w/${slug}/compose`);
  await expect(page.getByRole('button', { name: /mock_ig_1/, pressed: true })).toBeVisible();
  await page.getByLabel('Caption').fill('Text only does not work on Instagram');
  await expect(page.getByText('Instagram needs at least one image or video.').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Schedule$/ })).toBeDisabled();

  // Instagram options: Story, collaborators and first comment.
  await page.getByText('Instagram options').click();
  await page.getByLabel('Add collaborators').fill('@Partner.Brand');
  await page.getByRole('button', { name: 'Invite' }).click();
  await expect(page.getByText('@partner.brand')).toBeVisible();
  await page.getByLabel(/First comment for/).fill('#extra #tags');
  await page.getByRole('radio', { name: 'Story' }).click();
  await expect(page.getByText('Publishes as: Story')).toBeVisible();
  await expect(page.getByText('An Instagram Story needs exactly one image or video.').first()).toBeVisible();
});

test('connects X, LinkedIn and YouTube to a project', async ({ page }) => {
  const email = await signUp(page);
  const slug = await createWorkspace(page, `Five Channels ${Date.now() % 10000}`);
  await verifyEmail(page, email);
  for (const [platform, account, shown] of [
    ['X', 'Mock X 1', '@mock_x_1'],
    ['LINKEDIN', 'Mock LinkedIn Page 1', 'Mock LinkedIn Page 1'],
    ['YOUTUBE', 'Mock YouTube Channel 1', '@mockchannel1'],
  ] as const) {
    await page.goto(`/w/${slug}/channels`);
    await page.getByTestId('project-card').first().locator(`a[href*="platform=${platform}"]`).click();
    await page.waitForURL(/channels\/connect\?pending=/);
    await page.getByLabel(`Connect ${account}`).check();
    await page.getByRole('button', { name: /^Link to / }).click();
    await page.waitForURL(/channels\?connected=/);
    await expect(page.getByTestId('project-card').first().getByText(shown, { exact: true })).toBeVisible();
  }
  // The composer offers all three, with YouTube's own settings.
  await page.goto(`/w/${slug}/compose`);
  await expect(page.getByRole('button', { name: /mock_x_1/, pressed: true })).toBeVisible();
  await page.getByText('YouTube options').click();
  await expect(page.getByLabel('YouTube title')).toBeVisible();
  await expect(page.getByText('YouTube needs exactly one video.').first()).toBeVisible();
});
