import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

// Textarea (#336): real Chromium geometry for autoResize, and the real keyboard / clipboard / drag
// against a forced or locked control. Line height 20px, vertical padding 2 × 7px, border 2 × 1px.
const LINE = 20;
const CHROME = 14 + 2;

const area = (page: Page) => page.getByRole('textbox', { name: /Rejection reason/ });
const height = (el: Locator) => el.evaluate((n) => n.getBoundingClientRect().height);
const lines = (n: number) => Array.from({ length: n }, (_, i) => `Line ${i + 1}`).join('\n');

test.describe('stories', () => {
  for (const id of ['playground', 'forced', 'looks']) {
    test(`(1) the play function of ${id} passes`, async ({ page }) => {
      await expectPlayToPass(page, `forms-textarea--${id}`);
      await expectNoA11yViolations(page);
    });
  }
});

test.describe('forced / locked: the value cannot change', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  for (const state of ['forced', 'locked'] as const) {
    test(`(2) ${state}: typing, paste, Backspace, Delete, cut and a text drag change nothing`, async ({ page }) => {
      await gotoStory(page, 'forms-textarea--forced', `fieldState:${state}`);
      const forced = area(page);
      await expect(forced).toHaveAttribute('readonly', '');
      await expect(forced).toHaveAccessibleDescription(/Decided by the framework agreement\./);
      const original = await forced.inputValue();
      await forced.focus();
      await expect(forced).toBeFocused();
      await page.keyboard.type('abc');
      await page.evaluate(() => navigator.clipboard.writeText('PASTED'));
      await page.keyboard.press('Control+V');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Delete');
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Control+X');
      await page.keyboard.press('Delete');
      await expect(forced).toHaveValue(original);
      // Drag a selected word to the end of the text.
      await forced.dblclick({ position: { x: 20, y: 12 } });
      const box = (await forced.boundingBox())!;
      await page.mouse.move(box.x + 20, box.y + 12);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 8 });
      await page.mouse.up();
      await expect(forced).toHaveValue(original);
    });
  }
});

test.describe('autoResize geometry', () => {
  test('(3) the height follows the content: grows with lines, shrinks when they are deleted, never below rows', async ({ page }) => {
    await gotoStory(page, 'forms-textarea--manual', 'rows:2;maxRows:6');
    const el = area(page);
    expect(await height(el)).toBe(2 * LINE + CHROME);
    await el.click();
    await page.keyboard.type(lines(4).replaceAll('\n', '\n'), { delay: 0 });
    await expect.poll(() => height(el)).toBe(4 * LINE + CHROME);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await expect.poll(() => height(el)).toBe(2 * LINE + CHROME);
  });

  test('(4) maxRows: the height stops at that many rows and the content scrolls inside; under the limit there is no scrollbar', async ({ page }) => {
    await gotoStory(page, 'forms-textarea--manual', 'rows:2;maxRows:4');
    const el = area(page);
    await el.click();
    await page.keyboard.type(lines(4));
    await expect.poll(() => height(el)).toBe(4 * LINE + CHROME);
    // Exactly at the limit: no phantom scrollbar.
    expect(await el.evaluate((n) => n.scrollHeight <= n.clientHeight)).toBe(true);
    for (let i = 0; i < 4; i++) await page.keyboard.press('Enter');
    await page.keyboard.type('more');
    await expect.poll(() => el.evaluate((n) => n.scrollHeight > n.clientHeight)).toBe(true);
    expect(await height(el)).toBe(4 * LINE + CHROME);
    expect(await el.evaluate((n) => getComputedStyle(n).overflowY)).toBe('auto');
  });

  test('(5) under the limit scrollHeight never exceeds clientHeight, whatever the row count', async ({ page }) => {
    await gotoStory(page, 'forms-textarea--manual', 'rows:2;maxRows:12');
    const el = area(page);
    await el.click();
    for (let n = 1; n <= 8; n++) {
      await page.keyboard.type(`Row ${n}`);
      await page.keyboard.press('Enter');
      expect(await el.evaluate((node) => node.scrollHeight <= node.clientHeight), `after ${n} rows`).toBe(true);
    }
  });

  test('(6) the first paint already has the content height (no 3-row frame followed by a jump)', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __firstFrame?: number };
      new MutationObserver((_, observer) => {
        const el = document.querySelector('textarea');
        if (!el) return;
        observer.disconnect();
        requestAnimationFrame(() => (w.__firstFrame = el.getBoundingClientRect().height));
      }).observe(document, { childList: true, subtree: true });
    });
    await gotoStory(page, 'forms-textarea--with-initial-text');
    const el = area(page);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __firstFrame?: number }).__firstFrame)).toBeDefined();
    const first = await page.evaluate(() => (window as unknown as { __firstFrame?: number }).__firstFrame);
    expect(first).toBe(await height(el));
    expect(first).toBe(4 * LINE + CHROME);
  });

  test('(7) a native form reset restores the text and the height follows, with no change event', async ({ page }) => {
    await gotoStory(page, 'forms-textarea--with-initial-text');
    const el = area(page);
    await el.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nfive\nsix\nseven');
    await expect.poll(() => height(el)).toBe(5 * LINE + CHROME); // maxRows 5
    const before = await el.inputValue();
    expect(before).toContain('seven');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(el).toHaveValue('Line one\nLine two\nLine three\nLine four');
    await expect.poll(() => height(el)).toBe(4 * LINE + CHROME);
  });

  test('(8) a value set from outside after mount resizes the control and calls nothing', async ({ page }) => {
    await gotoStory(page, 'forms-textarea--external-value');
    const el = area(page);
    expect(await height(el)).toBe(3 * LINE + CHROME);
    await page.getByRole('button', { name: 'Load text' }).click();
    await expect(el).toHaveValue('1\n2\n3\n4\n5');
    await expect.poll(() => height(el)).toBe(5 * LINE + CHROME);
    await expect(page.getByTestId('calls')).toHaveText('0');
  });

  test('(9) created in a display:none container, it has the right height once shown (not stuck at 0)', async ({ page }) => {
    await gotoStory(page, 'forms-textarea--hidden-at-mount');
    await page.getByRole('button', { name: 'Show' }).click();
    const el = area(page);
    await expect(el).toBeVisible();
    await expect.poll(() => height(el)).toBe(5 * LINE + CHROME);
  });

  test('(10) a long token wraps inside the control: no horizontal overflow; narrowing the column re-measures', async ({ page }) => {
    await gotoStory(page, 'forms-textarea--long-token');
    const el = area(page);
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    expect(await el.evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(true);
    const wide = await height(el);
    expect(wide).toBeGreaterThan(3 * LINE + CHROME);
    await page.locator('#storybook-root > div').evaluate((n) => (n.style.maxWidth = '120px'));
    await expect.poll(() => height(el)).toBeGreaterThan(wide);
    expect(await el.evaluate((n) => n.scrollHeight <= n.clientHeight)).toBe(true);
    // The control stays inside its Field's column.
    const [control, column] = await Promise.all([
      el.evaluate((n) => n.getBoundingClientRect().right),
      el.evaluate((n) => n.parentElement!.getBoundingClientRect().right),
    ]);
    expect(control).toBeLessThanOrEqual(column + 0.5);
  });

  test('(11) rows changed from outside moves the minimum height (Controls)', async ({ page }) => {
    await gotoStory(page, 'forms-textarea--manual', 'rows:2;maxRows:6');
    expect(await height(area(page))).toBe(2 * LINE + CHROME);
    await gotoStory(page, 'forms-textarea--manual', 'rows:5;maxRows:6');
    expect(await height(area(page))).toBe(5 * LINE + CHROME);
  });
});

test.describe('without autoResize', () => {
  test('(12) the height is `rows` and the handle resizes vertically only', async ({ page }) => {
    await gotoStory(page, 'forms-textarea--manual', 'autoResize:!false;rows:4');
    const el = area(page);
    expect(await height(el)).toBe(4 * LINE + CHROME);
    expect(await el.evaluate((n) => getComputedStyle(n).resize)).toBe('vertical');
    await el.click();
    await page.keyboard.type(lines(8));
    expect(await height(el)).toBe(4 * LINE + CHROME);
    await expectNoA11yViolations(page);
  });

  test('(13) autoResize turns the manual handle off', async ({ page }) => {
    await gotoStory(page, 'forms-textarea--manual');
    expect(await area(page).evaluate((n) => getComputedStyle(n).resize)).toBe('none');
  });
});

// Virtual keyboard (spec §1.10): same simulated visual viewport as e2e/field.spec.ts.
for (const [name, viewport] of [
  ['mobile', { width: 375, height: 667 }],
  ['tablet', { width: 768, height: 1024 }],
] as const) {
  test.describe(`virtual keyboard (${name})`, () => {
    test.use({ viewport, hasTouch: true });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const target = new EventTarget();
        let keyboard = 0;
        const vv = Object.defineProperties(target, {
          offsetTop: { value: 0 },
          offsetLeft: { value: 0 },
          pageTop: { value: 0 },
          pageLeft: { value: 0 },
          scale: { value: 1 },
          height: { get: () => window.innerHeight - keyboard },
          width: { get: () => window.innerWidth },
        });
        Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
        (window as unknown as { __setKeyboard: (px: number) => void }).__setKeyboard = (px) => {
          keyboard = px;
          target.dispatchEvent(new Event('resize'));
        };
      });
    });

    test('(14) an autoResize textarea near the bottom that grows while typing stays above the keyboard', async ({ page }) => {
      await gotoStory(page, 'forms-textarea--keyboard-safe');
      const el = area(page);
      await el.evaluate((n) => n.scrollIntoView({ block: 'end' }));
      const keyboard = Math.round(viewport.height * 0.45);
      const bottom = () => el.evaluate((n) => n.getBoundingClientRect().bottom);
      await el.focus();
      await page.evaluate((px) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(px), keyboard);
      await expect.poll(bottom).toBeLessThanOrEqual(viewport.height - keyboard);
      const start = await height(el);
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Enter');
        await page.keyboard.type(`Line ${i}`);
        await expect.poll(bottom, `after line ${i}`).toBeLessThanOrEqual(viewport.height - keyboard);
      }
      expect(await height(el)).toBeGreaterThan(start);
    });
  });
}
