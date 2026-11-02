import { expect, test, type Locator } from '@playwright/test';
import { gotoStory } from './helpers/story';

const STORY = 'primitives-button--text-decoration';

const decoration = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).textDecorationLine);
const svgDecorations = (locator: Locator) =>
  locator.evaluate((el) => [...el.querySelectorAll('svg')].map((svg) => getComputedStyle(svg).textDecorationLine));

test.describe('Primitives/Button text-decoration (#115)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoStory(page, STORY);
  });

  test('size="inline" is underlined; sm, md, lg are not', async ({ page }) => {
    expect(await decoration(page.getByTestId('deco-inline'))).toBe('underline');
    for (const size of ['sm', 'md', 'lg']) {
      expect(await decoration(page.getByTestId(`deco-${size}`)), size).toBe('none');
    }
  });

  test('every icon-only size has no decoration', async ({ page }) => {
    for (const size of ['icon-xs', 'icon-sm', 'icon-md']) {
      const button = page.getByTestId(`deco-${size}`);
      expect(await decoration(button), size).toBe('none');
      const icons = await svgDecorations(button);
      expect(icons.length).toBeGreaterThan(0);
      expect(icons.every((d) => d === 'none')).toBe(true);
    }
  });

  test('leading and trailing SVG icons of an inline button are not underlined', async ({ page }) => {
    for (const id of ['deco-inline-lead', 'deco-inline-trail']) {
      const button = page.getByTestId(id);
      expect(await decoration(button), id).toBe('underline');
      const icons = await svgDecorations(button);
      expect(icons.length, id).toBe(1);
      expect(icons, id).toEqual(['none']);
    }
  });

  test('the underline persists on hover and on keyboard focus', async ({ page }) => {
    const inline = page.getByTestId('deco-inline');
    await inline.hover();
    expect(await inline.evaluate((el) => el.matches(':hover'))).toBe(true);
    expect(await decoration(inline)).toBe('underline');
    await page.mouse.move(0, 0);
    await page.keyboard.press('Tab');
    await inline.focus();
    expect(await inline.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
    expect(await decoration(inline)).toBe('underline');
  });

  test('the underline persists under forced-colors: active', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    const inline = page.getByTestId('deco-inline');
    expect(await decoration(inline)).toBe('underline');
    await inline.hover();
    expect(await decoration(inline)).toBe('underline');
    expect(await decoration(page.getByTestId('deco-md'))).toBe('none');
  });

  test('asChild: the resulting <a> is underlined with size="inline", not with size="md"', async ({ page }) => {
    const inline = page.getByTestId('deco-aschild-inline');
    const medium = page.getByTestId('deco-aschild-md');
    expect(await inline.evaluate((el) => el.tagName)).toBe('A');
    expect(await decoration(inline)).toBe('underline');
    expect(await medium.evaluate((el) => el.tagName)).toBe('A');
    expect(await decoration(medium)).toBe('none');
  });
});
