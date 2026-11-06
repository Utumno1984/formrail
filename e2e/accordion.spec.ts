import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const ACC = 'navigation-accordion--';
const COL = 'navigation-collapsible--';

test.describe('Navigation/Accordion', () => {
  test('Playground, NotCollapsible and DisabledItem play functions pass; axe is clean', async ({ page }) => {
    for (const id of ['playground', 'not-collapsible', 'disabled-item']) {
      await expectPlayToPass(page, `${ACC}${id}`);
      await expectNoA11yViolations(page);
    }
  });

  test('every visual story is free of a11y violations and of horizontal overflow', async ({ page }) => {
    for (const id of ['closed', 'one-open', 'multiple-open', 'long-trigger']) {
      await gotoStory(page, `${ACC}${id}`);
      await expectNoA11yViolations(page);
      await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    }
  });

  test('no overflow at 375px with a long label', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, `${ACC}long-trigger`);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(scroll).toBeLessThanOrEqual(0);
  });

  test('trigger: aria-expanded / aria-controls, heading, labelled region', async ({ page }) => {
    await gotoStory(page, `${ACC}one-open`);
    const trigger = page.getByRole('button', { name: 'Shipping' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const controls = await trigger.getAttribute('aria-controls');
    await expect(page.locator(`[id="${controls}"]`)).toHaveAttribute('role', 'region');
    await expect(page.getByRole('region', { name: 'Shipping' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Shipping' })).toBeVisible();
  });

  test('single: opening another item closes the first; closed field is unreachable and not in the a11y tree', async ({ page }) => {
    await gotoStory(page, `${ACC}one-open`);
    await page.getByRole('button', { name: 'Billing' }).click();
    await expect(page.getByRole('button', { name: 'Shipping' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('textbox', { name: 'Shipping note' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Shipping' }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Billing' })).toBeFocused();
  });

  test('during the closing animation the content is already inert (not tabbable)', async ({ page }) => {
    await gotoStory(page, `${ACC}one-open`);
    // Slow the exit down so the window in which the panel is closed but still mounted is observable.
    await page.addStyleTag({ content: ':root { --motion-rop-disclosure-duration: 1500ms !important; }' });
    const field = page.locator('input[aria-label="Shipping note"]');
    await page.getByRole('button', { name: 'Shipping' }).click();
    await expect(field).toHaveCount(1);
    expect(await field.evaluate((el) => !!el.closest('[inert]'))).toBe(true);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).not.toBe('Shipping note');
    await expect(field).toHaveCount(0, { timeout: 5000 });
  });

  test('multiple: two items stay open', async ({ page }) => {
    await gotoStory(page, `${ACC}multiple-open`);
    await expect(page.getByRole('button', { name: 'Invoice details' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Billing' })).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: 'Shipping' }).click();
    await expect(page.getByRole('button', { name: 'Invoice details' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Shipping' })).toHaveAttribute('aria-expanded', 'true');
  });

  test('keyboard: arrows wrap, Home / End, disabled item skipped', async ({ page }) => {
    await gotoStory(page, `${ACC}disabled-item`);
    // The story's own play function has already moved the focus: start from the first trigger.
    await page.getByRole('button', { name: 'Invoice details' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: 'Billing' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: 'Invoice details' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('button', { name: 'Billing' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.getByRole('button', { name: 'Invoice details' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('button', { name: 'Billing' })).toBeFocused();
  });

  test('focus ring is visible on the trigger, also with an open panel', async ({ page }) => {
    await gotoStory(page, `${ACC}one-open`);
    await page.keyboard.press('Tab');
    await expectFocusRingVisible(page.getByRole('button', { name: 'Invoice details' }));
  });

  test('after a real opening animation the panel is at rest: overflow visible and the height follows the content', async ({ page }) => {
    // Starts closed and opens with a click, so the keyframes really run (a panel mounted open never animates).
    await gotoStory(page, `${ACC}closed`);
    await page.getByRole('button', { name: 'Shipping' }).click();
    const region = page.getByRole('region', { name: 'Shipping' });
    await expect(region).toBeVisible();
    await page.waitForTimeout(600);
    const state = () => region.evaluate((el) => ({ overflow: getComputedStyle(el).overflow, height: el.getBoundingClientRect().height }));
    const before = await state();
    expect(before.overflow).toBe('visible');
    // Content that grows after the animation (text loaded later): the panel must follow, not stay frozen.
    await region.evaluate((el) => {
      const filler = document.createElement('div');
      filler.style.height = '200px';
      el.firstElementChild!.appendChild(filler);
    });
    expect((await state()).height).toBeGreaterThan(before.height + 150);
  });

  test('chevron rotation does not change the trigger size', async ({ page }) => {
    await gotoStory(page, `${ACC}closed`);
    const trigger = page.getByRole('button', { name: 'Shipping' });
    const before = await trigger.boundingBox();
    await trigger.click();
    await expect(page.getByRole('region', { name: 'Shipping' })).toBeVisible();
    await page.waitForTimeout(400);
    const after = await trigger.boundingBox();
    expect(Math.abs(after!.width - before!.width)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(0.5);
  });

  test('motion: the panel animates its height; with prefers-reduced-motion it appears at once', async ({ page }) => {
    await gotoStory(page, `${ACC}closed`);
    await page.getByRole('button', { name: 'Shipping' }).click();
    const animated = await page.getByRole('region', { name: 'Shipping' }).evaluate((el) => getComputedStyle(el).animationName);
    expect(animated).toContain('rop-disclosure-down');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoStory(page, `${ACC}closed`);
    await page.getByRole('button', { name: 'Billing' }).click();
    const region = page.getByRole('region', { name: 'Billing' });
    await expect(region).toBeVisible();
    expect(await region.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await page.getByRole('button', { name: 'Billing' }).click();
    await expect(page.getByRole('textbox', { name: 'Billing note' })).toHaveCount(0);
  });

  test('a rapid double click ends in the state of the last gesture, nothing stuck half way', async ({ page }) => {
    await gotoStory(page, `${ACC}closed`);
    const trigger = page.getByRole('button', { name: 'Shipping' });
    await trigger.dblclick();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('textbox', { name: 'Shipping note' })).toHaveCount(0);
    await trigger.click();
    await trigger.click();
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const region = page.getByRole('region', { name: 'Shipping' });
    await expect(region).toBeVisible();
    await page.waitForTimeout(400);
    expect(await region.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(30);
  });
});

test.describe('focus rescue when a panel is closed from outside', () => {
  const cases = [
    { name: 'Accordion', story: `${ACC}closed-from-outside`, field: 'Details note', trigger: 'Invoice details' },
    { name: 'Collapsible', story: `${COL}closed-from-outside`, field: 'Reference', trigger: 'Advanced options' },
  ];
  for (const c of cases) {
    for (const reduced of [false, true]) {
      test(`${c.name}${reduced ? ' (reduced motion)' : ''}: focus inside the panel ends on its trigger, not <body> @engines`, async ({ page }) => {
        if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
        await gotoStory(page, c.story);
        const field = page.getByRole('textbox', { name: c.field });
        await field.focus();
        await expect(field).toBeFocused();
        // Closed by the parent (controlled state), not by clicking the trigger: dispatch the click so
        // the focus is not moved by the gesture itself.
        await page.getByRole('button', { name: 'Close from outside' }).dispatchEvent('click');
        await expect(page.getByRole('button', { name: c.trigger })).toBeFocused();
        expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
      });
    }
  }
});

test.describe('Navigation/Collapsible', () => {
  test('Playground play passes; axe is clean in every story', async ({ page }) => {
    await expectPlayToPass(page, `${COL}playground`);
    await expectNoA11yViolations(page);
    for (const id of ['closed', 'open']) {
      await gotoStory(page, `${COL}${id}`);
      await expectNoA11yViolations(page);
    }
  });

  test('toggle: aria-expanded follows click; focus ring is visible', async ({ page }) => {
    await gotoStory(page, `${COL}closed`);
    const trigger = page.getByRole('button', { name: 'Advanced options' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('textbox', { name: 'Reference' })).toBeVisible();
    await trigger.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expectFocusRingVisible(trigger);
  });
});
