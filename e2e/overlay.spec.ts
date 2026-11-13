import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToFail, expectPlayToPass, gotoStory } from './helpers/story';

const LAYERS = 'internal-overlaylayers--layers';

/**
 * Test id of the topmost element at a point of the intersection of two elements' rects: its centre,
 * or 10px inside its top-left corner (`corner`, for pairs whose centre is covered by a third panel).
 */
async function topAtOverlap(
  page: Page,
  upper: string,
  lower: string,
  corner = false,
): Promise<string | null> {
  return page.evaluate(
    ([a, b, corner]) => {
      const ra = document.querySelector(`[data-testid=${a}]`)!.getBoundingClientRect();
      const rb = document.querySelector(`[data-testid=${b}]`)!.getBoundingClientRect();
      const left = Math.max(ra.left, rb.left);
      const right = Math.min(ra.right, rb.right);
      const top = Math.max(ra.top, rb.top);
      const bottom = Math.min(ra.bottom, rb.bottom);
      if (right <= left || bottom <= top) throw new Error(`${a} and ${b} do not overlap`);
      const hit = document.elementFromPoint(
        corner ? left + 10 : (left + right) / 2,
        corner ? top + 10 : (top + bottom) / 2,
      );
      return hit?.closest('[data-testid]')?.getAttribute('data-testid') ?? null;
    },
    [upper, lower, corner] as const,
  );
}

test.describe('Internal/OverlayLayers', () => {
  test('the popover is above the modal and the tooltip above the popover (elementFromPoint)', async ({ page }) => {
    await gotoStory(page, LAYERS);
    await expect(page.getByTestId('popover')).toBeVisible();
    expect(await topAtOverlap(page, 'popover', 'modal', true)).toBe('popover');
    expect(await topAtOverlap(page, 'tooltip', 'popover')).toBe('tooltip');
    expect(await topAtOverlap(page, 'modal', 'backdrop', true)).toBe('modal');
  });

  test('the Radix positioning wrapper carries the z-index of the requested level, not only the content', async ({
    page,
  }) => {
    await gotoStory(page, LAYERS);
    await expect(page.getByTestId('popover')).toBeVisible();
    const z = await page.evaluate(() => {
      const content = document.querySelector('[data-testid=popover]') as HTMLElement;
      const wrapper = content.closest('[data-radix-popper-content-wrapper]') as HTMLElement;
      return {
        wrapper: getComputedStyle(wrapper).zIndex,
        content: getComputedStyle(content).zIndex,
        token: getComputedStyle(document.documentElement).getPropertyValue('--z-index-rop-popover').trim(),
      };
    });
    expect(z.token).toBe('40');
    expect(z.wrapper).toBe('40');
    expect(z.content).toBe('40');
  });

  test('clicking in the overlap reaches the popover, not the modal; the play function passes', async ({ page }) => {
    await expectPlayToPass(page, LAYERS);
  });

  test('the z-index of each level comes from the token scale, in increasing order', async ({ page }) => {
    await gotoStory(page, LAYERS);
    await expect(page.getByTestId('popover')).toBeVisible();
    const zs = await page.evaluate(() =>
      ['backdrop', 'modal', 'popover', 'tooltip'].map((id) =>
        Number(getComputedStyle(document.querySelector(`[data-testid=${id}]`)!).zIndex),
      ),
    );
    expect(zs).toEqual([20, 30, 40, 50]);
  });

  test('passes axe', async ({ page }) => {
    await gotoStory(page, LAYERS);
    await expect(page.getByTestId('popover')).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test.describe('Internal/ReturnFocus', () => {
  test('opened with the button (auto-focused field inside): Escape returns the focus to the button', async ({
    page,
  }) => {
    await expectPlayToPass(page, 'internal-returnfocus--from-button');
    const opener = page.getByRole('button', { name: 'Open overlay' });
    await opener.click();
    await expect(page.getByRole('textbox', { name: 'Name' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
  });

  test('opened from the keyboard shortcut (state outside any trigger): focus returns to the previous element', async ({
    page,
  }) => {
    await expectPlayToPass(page, 'internal-returnfocus--from-keyboard-shortcut');
    const other = page.getByRole('button', { name: /Other control/ });
    await other.focus();
    await page.keyboard.press('Alt+o');
    await expect(page.getByRole('textbox', { name: 'Name' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(other).toBeFocused();
  });

  test('opener removed while open: the focus goes to the fallback and the console stays clean', async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(m.text());
    });
    await expectPlayToPass(page, 'internal-returnfocus--opener-removed');
    await page.getByRole('button', { name: 'Open overlay' }).click();
    await expect(page.getByRole('button', { name: 'Open overlay' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Fallback' })).toBeFocused();
    expect(problems).toEqual([]);
  });

  test('opener removed and no fallback: nothing throws and the focus is not given to an arbitrary node', async ({
    page,
  }) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(String(e)));
    // The play of this story expects the fallback to get the focus, so with `withFallback:!false` it
    // fails by design (expectPlayToPass would throw), and it must fail on THAT expectation (the
    // Fallback button never gets the focus), not on anything else. It still clicks Open overlay and
    // presses Escape: it must end before the test drives the same controls.
    await expectPlayToFail(page, 'internal-returnfocus--opener-removed', 'withFallback:!false', /^expect\(element\)\.toHaveFocus\(\)[\s\S]*Fallback/);
    await page.getByRole('button', { name: 'Open overlay' }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    expect(problems).toEqual([]);
  });

  for (const id of ['from-button', 'from-keyboard-shortcut', 'opener-removed']) {
    test(`the play function of ${id} passes`, async ({ page }) => {
      await expectPlayToPass(page, `internal-returnfocus--${id}`);
    });
  }
});
