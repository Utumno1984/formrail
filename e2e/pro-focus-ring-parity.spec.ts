import { expect, test, type Locator } from '@playwright/test';
import { gotoStory } from './helpers/story';

// #486: the keyboard focus ring of the Pro RebaseNotice (focused from script, `tabIndex={-1}`) is the same one the
// core Button draws. No shared token (see scripts/pro-style-guard.test.mjs for the source comparison): the two
// COMPUTED quadruples must be equal, and not an absent ring (two missing rings would also be "equal").
type Ring = { style: string; width: string; color: string; offset: string };

const ringOf = (el: Locator): Promise<Ring> =>
  el.evaluate((node) => {
    const s = getComputedStyle(node);
    return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor, offset: s.outlineOffset };
  });

function expectVisibleRing(ring: Ring): void {
  expect(ring.style).not.toMatch(/^(none|hidden|)$/);
  expect(ring.width).not.toMatch(/^(0px|)$/);
  expect(ring.color).not.toBe('');
  expect(ring.color).not.toBe('rgba(0, 0, 0, 0)');
}

test('the Pro RebaseNotice focus ring equals the core Button focus ring (computed)', async ({ page }) => {
  await gotoStory(page, 'primitives-button--overview');
  const button = page.locator('#storybook-root button:not(:disabled)').first();
  await page.keyboard.press('Tab');
  await expect(button).toBeFocused();
  const core = await ringOf(button);

  await gotoStory(page, 'pro-rebasenotice--one-conflict');
  const notice = page.locator('.rop-pro-rebase-notice');
  await expect(notice).toBeVisible();
  // Keyboard modality first (so :focus-visible matches), then the focus from script, as the component does.
  await page.keyboard.press('Tab');
  await notice.evaluate((el) => (el as HTMLElement).focus());
  await expect(notice).toBeFocused();
  const pro = await ringOf(notice);

  expectVisibleRing(core);
  expectVisibleRing(pro);
  expect(pro).toEqual(core);
});
