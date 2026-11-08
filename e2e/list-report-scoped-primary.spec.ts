import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass } from './helpers/story';

// The row selection and the count flash (#293) are drawn with tints of --color-rop-primary, so they must
// follow a primary redeclared on a wrapper or on :root, not stay the default blue. A `play` function cannot
// prove hover or pressed (`userEvent.hover` does not trigger the CSS `:hover`, and `rop-hover` needs
// `(hover: hover) and (pointer: fine)`): the mouse here is Playwright's real one. Expected colours are
// computed independently of tokens.css, from the mix formula (8% / 16% / 50% of the primary on white).
const STORY = 'floorplans-list-report--selection-scoped-primary';
const NO_PLAY = 'floorplans-list-report--selection-scoped-primary-no-play';

type Rgb = [number, number, number];
const VIOLET: Rgb = [107, 63, 160]; // #6b3fa0, the wrapper of the story
const FOREST: Rgb = [31, 107, 58]; // #1f6b3a, dark, declared on :root
const YELLOW: Rgb = [255, 216, 77]; // #ffd84d, light, declared on :root
const BLUE: Rgb = [10, 110, 209]; // the default primary

/** `color-mix(in srgb, <base> <percent>%, white)`, in 8-bit channels. */
const tint = (base: Rgb, percent: number): Rgb =>
  base.map((c) => Math.round((c * percent) / 100 + (255 * (100 - percent)) / 100)) as Rgb;

type Property = 'backgroundColor' | 'borderTopColor';

/** A computed colour as 8-bit channels, whatever serialization the browser uses (rgb() or color(srgb ...)). */
function colour(target: Locator, property: Property = 'backgroundColor'): Promise<number[]> {
  return target.evaluate((el, prop) => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = getComputedStyle(el)[prop];
    ctx.fillRect(0, 0, 1, 1);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
  }, property);
}

/** Within one 8-bit step per channel: the browser and the formula may round a half differently. */
async function expectColour(target: Locator, expected: Rgb, label: string, property?: Property): Promise<void> {
  const actual = await colour(target, property);
  actual.forEach((c, i) => expect(Math.abs(c - expected[i]!), `${label}: channel ${i} is ${c}, expected ${expected[i]}`).toBeLessThanOrEqual(1));
}

const table = (page: Page): Locator => page.getByRole('table', { name: 'Invoices' });
const selectedRow = (page: Page): Locator => table(page).locator('tbody tr[data-selected]').first();
const plainRow = (page: Page): Locator => table(page).locator('tbody tr:not([data-selected]):not([aria-hidden])').first();

/** Moves away before releasing, so the press never turns into a click. */
async function cancelPress(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await page.mouse.up();
}

/** Rest, real mouse over, real mouse down on a row: the three fills of the selected row. */
async function expectRowStates(page: Page, base: Rgb): Promise<void> {
  const row = selectedRow(page);
  await expectColour(row, tint(base, 8), 'rest');
  await row.locator('td').nth(2).hover();
  await expectColour(row, tint(base, 16), 'hover');
  await page.mouse.down();
  await expectColour(row, tint(base, 16), 'pressed');
  await cancelPress(page);
  await expectColour(row, tint(base, 8), 'back to rest');
}

test.describe('Floorplans/List Report: selection follows a redeclared primary', () => {
  test.describe('on a wrapper', () => {
    test.use({ reducedMotion: 'reduce' });

    test.beforeEach(async ({ page }) => {
      await expectPlayToPass(page, STORY);
      await page.mouse.move(0, 0);
    });

    test('the story passes axe', async ({ page }) => {
      await expectNoA11yViolations(page);
    });

    test('selected row: rest, hover and pressed are tints of the scoped violet, never the default blue', async ({ page }) => {
      await expectRowStates(page, VIOLET);
      const blue = tint(BLUE, 8);
      const actual = await colour(selectedRow(page));
      expect(actual.some((c, i) => Math.abs(c - blue[i]!) > 1), 'not the blue family').toBe(true);
    });

    test('an unselected row keeps the neutral hover (the tint is only for the selection)', async ({ page }) => {
      const row = plainRow(page);
      await row.locator('td').nth(2).hover();
      const actual = await colour(row);
      // neutral grey-ish surface-subtle, not a violet tint
      expect(Math.abs(actual[0]! - actual[2]!)).toBeLessThan(12);
      await page.mouse.move(0, 0);
    });
  });

  test('count flash: the pill takes the scoped violet tint and border, then returns to rest', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expectPlayToPass(page, NO_PLAY);
    const pill = page.locator('[data-rop-count]');
    const rest = await colour(pill);
    await page.getByRole('radio', { name: 'Open' }).click();
    await expect(pill).toHaveAttribute('data-changed', '');
    // the flash is short (200ms): poll every frame for the final tinted fill and border
    const [fill, border] = [tint(VIOLET, 8), tint(VIOLET, 50)];
    await page.waitForFunction(
      ([el, f, b]) => {
        const read = (prop: 'backgroundColor' | 'borderTopColor') => {
          const ctx = document.createElement('canvas').getContext('2d')!;
          ctx.fillStyle = getComputedStyle(el as Element)[prop];
          ctx.fillRect(0, 0, 1, 1);
          return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
        };
        const close = (a: number[], e: number[]) => a.every((c, i) => Math.abs(c - e[i]!) <= 1);
        return close(read('backgroundColor'), f as number[]) && close(read('borderTopColor'), b as number[]);
      },
      [await pill.elementHandle(), fill, border] as const,
      { polling: 'raf', timeout: 2_000 },
    );
    await expect(pill).not.toHaveAttribute('data-changed');
    await expect.poll(() => colour(pill)).toEqual(rest);
  });

  for (const [name, hex, base] of [
    ['dark forest', '#1f6b3a', FOREST],
    ['light yellow', '#ffd84d', YELLOW],
  ] as const) {
    test.describe(`primary declared on :root (${name})`, () => {
      test.use({ reducedMotion: 'reduce' });

      test.beforeEach(async ({ page }) => {
        await expectPlayToPass(page, NO_PLAY);
        // the wrapper stops redeclaring it: the page's :root is the only source of the primary
        await page.evaluate((value) => {
          document.querySelector<HTMLElement>('[data-testid="violet-scope"]')!.style.removeProperty('--color-rop-primary');
          document.documentElement.style.setProperty('--color-rop-primary', value);
        }, hex);
        await page.mouse.move(0, 0);
      });

      test('selected row: rest, hover and pressed follow the :root primary', async ({ page }) => {
        await expectRowStates(page, base);
      });

      test('count flash follows the :root primary', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        // the flash is easy to miss at 200ms: make the colour change instant and watch for the attribute
        await page.addStyleTag({ content: '[data-rop-count] { transition: none !important; }' });
        await page.evaluate(() => {
          const el = document.querySelector('[data-rop-count]')!;
          const w = window as unknown as { __flash?: Promise<{ bg: string; border: string }> };
          w.__flash = new Promise((resolve) => {
            const observer = new MutationObserver(() => {
              if (!el.hasAttribute('data-changed')) return;
              requestAnimationFrame(() => {
                const s = getComputedStyle(el);
                resolve({ bg: s.backgroundColor, border: s.borderTopColor });
              });
              observer.disconnect();
            });
            observer.observe(el, { attributes: true, attributeFilter: ['data-changed'] });
          });
        });
        await page.getByRole('radio', { name: 'Open' }).click();
        const seen = await page.evaluate(() => (window as unknown as { __flash: Promise<{ bg: string; border: string }> }).__flash);
        // compare through the browser itself, with literal colours and no var()
        const [bg, border] = await page.evaluate((p) => {
          const probe = (value: string) => {
            const el = document.createElement('div');
            el.style.backgroundColor = value;
            document.body.append(el);
            const out = getComputedStyle(el).backgroundColor;
            el.remove();
            return out;
          };
          return [probe(`color-mix(in srgb, ${p} 8%, white)`), probe(`color-mix(in srgb, ${p} 50%, white)`)] as const;
        }, hex);
        expect(seen.bg, 'fill during the flash').toBe(bg);
        expect(seen.border, 'border during the flash').toBe(border);
      });
    });
  }
});
