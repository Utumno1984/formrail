import { expect, test } from '@playwright/test';

// Ticket #294: the native developer tools of the Storybook toolbar (grid / background / outline /
// measure) are hidden in the static build. The grid persisted across pages and, touched by accident
// on a phone, looked like a defect of the library. The viewport tool (#277) must stay.

const PAGES = [
  ['a Docs page', '/?path=/docs/primitives-button--docs'],
  ['the Introduction page', '/?path=/docs/introduction--docs'],
  ['a story (Canvas)', '/?path=/story/primitives-button--playground'],
] as const;

for (const [label, url] of PAGES) {
  test(`toolbar on ${label} has no developer tools`, async ({ page }) => {
    await page.goto(url);
    // The manager is rendered once the sidebar is there.
    await expect(page.getByRole('button', { name: 'Enter full screen' })).toBeVisible();
    for (const name of ['Grid visibility', 'Preview background', 'Outline tool', 'Measure tool']) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
      await expect(page.getByRole('switch', { name })).toHaveCount(0);
    }
  });
}

test('the viewport, zoom and fullscreen tools are still in the Canvas toolbar', async ({ page }) => {
  await page.goto('/?path=/story/primitives-button--playground');
  await expect(page.getByRole('button', { name: 'Enter full screen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Viewport size' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload story' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Change zoom level' })).toBeVisible();
});
