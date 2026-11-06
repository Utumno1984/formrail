import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const ID = 'navigation-tabs--';

const widths = (page: Page) =>
  page.getByRole('tab').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));

test.describe('Navigation/Tabs', () => {
  test('Playground, Manual and KeepMounted play functions pass; axe is clean', async ({ page }) => {
    for (const id of ['playground', 'manual', 'keep-mounted']) {
      await expectPlayToPass(page, `${ID}${id}`);
      await expectNoA11yViolations(page);
    }
  });

  test('every story is free of a11y violations', async ({ page }) => {
    for (const id of ['vertical', 'many-tabs', 'horizontal', 'disabled-tab', 'controlled']) {
      await gotoStory(page, `${ID}${id}`);
      await expectNoA11yViolations(page);
    }
  });

  test('tab widths and list height do not change between selected and unselected', async ({ page }) => {
    await gotoStory(page, `${ID}horizontal`);
    const list = page.getByTestId('list');
    const listHeight = (await list.boundingBox())!.height;
    const before = await widths(page);
    for (const name of ['Details', 'Attachments', 'History', 'Overview']) {
      await page.getByRole('tab', { name }).click();
      const after = await widths(page);
      after.forEach((w, i) => expect(Math.abs(w - before[i]!)).toBeLessThanOrEqual(0.5));
      expect(Math.abs((await list.boundingBox())!.height - listHeight)).toBeLessThanOrEqual(0.5);
    }
  });

  test('keyboard: Tab lands on the selected tab, arrows wrap and skip the disabled one, Home/End jump', async ({ page }) => {
    await gotoStory(page, `${ID}disabled-tab`);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Attachments' })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Attachments' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'History' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'History' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeFocused();
    // One tab stop: Tab leaves the list into the panel.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tabpanel')).toBeFocused();
  });

  test('vertical: up/down arrows', async ({ page }) => {
    await gotoStory(page, `${ID}vertical`);
    await page.getByRole('tab', { name: 'Overview' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('tab', { name: 'Details' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeFocused();
  });

  test('rtl: left/right are swapped', async ({ page }) => {
    await gotoStory(page, `${ID}horizontal`, 'dir:rtl');
    await page.getByRole('tab', { name: 'Overview' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Details' })).toBeFocused();
  });

  test('keepMounted: the typed value survives; hidden panels are out of the accessibility tree', async ({ page }) => {
    await gotoStory(page, `${ID}keep-mounted`);
    await page.getByRole('textbox', { name: 'Reference' }).fill('Draft');
    await page.getByRole('tab', { name: 'Details' }).click();
    await expect(page.locator('[role="tabpanel"][hidden]')).toHaveCount(2);
    await expect(page.getByRole('textbox', { name: 'Reference' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page.getByRole('textbox', { name: 'Reference' })).toHaveValue('Draft');
  });

  test('without keepMounted the value is lost', async ({ page }) => {
    await gotoStory(page, `${ID}playground`, 'keepMounted:!false');
    await page.getByRole('textbox', { name: 'Reference' }).fill('Draft');
    await page.getByRole('tab', { name: 'Details' }).click();
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page.getByRole('textbox', { name: 'Reference' })).toHaveValue('');
  });

  test('controlled: an external change moves tab and panel', async ({ page }) => {
    await gotoStory(page, `${ID}controlled`);
    await page.getByRole('button', { name: /Go to/ }).click();
    await expect(page.getByRole('tab', { name: 'Attachments' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toHaveText('Attachments panel');
  });

  test('focus ring is visible and not clipped by the scrolling list', async ({ page }) => {
    await gotoStory(page, `${ID}many-tabs`);
    await expectFocusRingVisible(page.getByRole('tab', { name: 'Overview' }));
  });

  test('12 tabs at 375px: the list scrolls inside, the page does not, the focused tab is brought into view', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, `${ID}many-tabs`);
    await expectNoHorizontalOverflow(page.locator('body'));
    const list = page.getByTestId('list');
    const scrollable = await list.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrollable).toBe(true);
    const pageY = await page.evaluate(() => window.scrollY);
    await page.getByRole('tab', { name: 'Overview' }).focus();
    for (let i = 0; i < 11; i++) {
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab').nth(i + 1)).toBeFocused();
    }
    const last = page.getByRole('tab', { name: 'Archive' });
    await expect(last).toBeFocused();
    const inside = await last.evaluate((el) => {
      const a = el.getBoundingClientRect();
      const b = el.parentElement!.getBoundingClientRect();
      return a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
    });
    expect(inside).toBe(true);
    expect(await page.evaluate(() => window.scrollY)).toBe(pageY);
    await expectNoHorizontalOverflow(page.locator('body'));
  });

  test('a very long label is truncated within a real max-width', async ({ page }) => {
    await gotoStory(page, `${ID}horizontal`);
    const tab = page.getByRole('tab').first();
    await tab.evaluate((el) => {
      el.firstElementChild!.textContent = 'A very very long label that goes on and on and on and on forever';
    });
    const box = (await tab.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(256 + 0.5);
  });

  test('prefers-reduced-motion: no transition on the tab', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoStory(page, `${ID}horizontal`);
    const duration = await page
      .getByRole('tab', { name: 'Overview' })
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration.split(',').every((d) => parseFloat(d) === 0)).toBe(true);
  });
});
