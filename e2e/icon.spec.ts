import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

const OVERVIEW = 'foundations-icon--overview';
const SIZES = { xs: 12, sm: 16, md: 20, lg: 24, xl: 32 } as const;

test.describe('Foundations/Icon', () => {
  test('each size measures exactly its token value, in strictly increasing order', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    let previous = 0;
    for (const [size, px] of Object.entries(SIZES)) {
      const box = await page.getByTestId(`icon-${size}`).boundingBox();
      expect(box?.width, size).toBe(px);
      expect(box?.height, size).toBe(px);
      expect(px).toBeGreaterThan(previous);
      previous = px;
    }
  });

  test('outside text the icon takes exactly its own space: no margin eats into neighbours or padding', async ({
    page,
  }) => {
    await gotoStory(page, OVERVIEW);
    for (const size of ['xs', 'xl']) {
      const icon = page.getByTestId(`icon-${size}`);
      const margins = await icon.evaluate((el) => {
        const cs = getComputedStyle(el);
        return [cs.marginTop, cs.marginBottom];
      });
      expect(margins, size).toEqual(['0px', '0px']);
      // The cell is a grid with a 6px gap: icon bottom -> caption top is exactly that gap.
      const gap = await icon.evaluate((el) => {
        const next = el.nextElementSibling as HTMLElement;
        return next.getBoundingClientRect().top - el.getBoundingClientRect().bottom;
      });
      expect(gap, size).toBe(6);
    }
  });

  test('the size comes from the CSS tokens, not from a hard-coded copy', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const tokens = await page.evaluate(() =>
      ['xs', 'sm', 'md', 'lg', 'xl'].map((s) => getComputedStyle(document.documentElement).getPropertyValue(`--icon-rop-${s}`).trim()),
    );
    expect(tokens).toEqual(Object.values(SIZES).map((px) => `${px}px`));
  });

  test('an arbitrary 100x100 SVG is forced to the requested size (xl), ignoring its own width/height', async ({
    page,
  }) => {
    await gotoStory(page, OVERVIEW);
    const svg = page.getByTestId('icon-arbitrary');
    expect(await svg.getAttribute('width')).toBe('100');
    const box = await svg.boundingBox();
    expect([box?.width, box?.height]).toEqual([32, 32]);
  });

  test('inherits the text colour (currentColor) from the token colour of its container', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const color = await page.getByTestId('icon-coloured').evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe('rgb(210, 10, 10)');
    const stroke = await page.getByTestId('icon-coloured').evaluate((el) => getComputedStyle(el).stroke);
    expect(stroke).toBe('rgb(210, 10, 10)');
  });

  test('accessibility tree: the labelled icon is an image with a name, decorative ones are absent', async ({
    page,
  }) => {
    await gotoStory(page, OVERVIEW);
    await expect(page.getByRole('img', { name: 'Error' })).toHaveCount(1);
    // Every other icon of the story is decorative: no other image role at all.
    await expect(page.getByRole('img')).toHaveCount(1);
    await expectNoA11yViolations(page);
  });

  test('all the internal icons are rendered and have a drawing', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    for (const name of ['close', 'chevron-down', 'check', 'info', 'success', 'warning', 'error']) {
      const icon = page.getByTestId(`internal-${name}`);
      await expect(icon, name).toBeVisible();
      expect(await icon.evaluate((el) => el.querySelectorAll('path, circle').length), name).toBeGreaterThan(0);
    }
  });

  test('Playground and Decorative play functions (Interactions) pass', async ({ page }) => {
    await expectPlayToPass(page, 'foundations-icon--playground');
    await expect(page.getByRole('img', { name: 'Error' })).toBeVisible();
    await expectPlayToPass(page, 'foundations-icon--decorative');
    await expect(page.getByRole('img')).toHaveCount(0);
    await expectNoA11yViolations(page);
  });
});
