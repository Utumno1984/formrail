import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass } from './helpers/story';

// A base colour redeclared on a wrapper reaches the derived states of everything inside it. A `play`
// function cannot prove this part: `userEvent.hover` does not trigger the CSS `:hover`, and `rop-hover`
// needs `(hover: hover) and (pointer: fine)`. So the mouse here is Playwright's real one, and every
// expected colour is computed from the formula in tokens.css (80% / 62% / 96% of the base + black).
const STORY = 'foundations-theming--scoped-derived-states';

type Rgb = [number, number, number];

const VIOLET: Rgb = [107, 63, 160]; // #6b3fa0
const ERROR: Rgb = [179, 18, 94]; // #b3125e
const SURFACE_SUBTLE: Rgb = [239, 230, 247]; // #efe6f7
const TEXT_MUTED: Rgb = [93, 74, 115]; // #5d4a73
const FOREST: Rgb = [31, 107, 58]; // #1f6b3a

/** `color-mix(in srgb, <base> <percent>%, black)`, in 8-bit channels. */
const shade = (base: Rgb, percent: number): Rgb => base.map((c) => Math.round((c * percent) / 100)) as Rgb;
const hover = (base: Rgb) => shade(base, 80);
const active = (base: Rgb) => shade(base, 62);

// Transitions off: every style is read in its final state.
test.use({ reducedMotion: 'reduce' });

/** A computed colour as 8-bit channels, whatever serialization the browser uses (rgb() or color(srgb ...)). */
function colour(target: Locator, property: 'backgroundColor' | 'color' | 'borderTopColor' = 'backgroundColor'): Promise<number[]> {
  return target.evaluate((el, prop) => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = getComputedStyle(el)[prop];
    ctx.fillRect(0, 0, 1, 1);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
  }, property);
}

/** Moves away before releasing, so the press never turns into a click that toggles the control. */
async function cancelPress(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await page.mouse.up();
}

/** Rest, real mouse over, real mouse down: the three colours of one control. */
async function expectStates(
  page: Page,
  target: Locator,
  expected: { rest: Rgb; hover: Rgb; pressed: Rgb },
  property?: 'backgroundColor' | 'color' | 'borderTopColor',
): Promise<void> {
  expect(await colour(target, property), 'rest').toEqual(expected.rest);
  await target.hover();
  expect(await colour(target, property), 'hover').toEqual(expected.hover);
  await page.mouse.down();
  expect(await colour(target, property), 'pressed').toEqual(expected.pressed);
  await cancelPress(page);
}

test.describe('Foundations/Theming: scoped theme and derived states', () => {
  test.beforeEach(async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await page.mouse.move(0, 0);
  });

  test('the story passes axe', async ({ page }) => {
    await expectNoA11yViolations(page);
  });

  test('Button primary and danger: hover and pressed are shades of the scoped colours @engines', async ({ page }) => {
    await expectStates(page, page.getByRole('button', { name: 'Approve', exact: true }), {
      rest: VIOLET,
      hover: hover(VIOLET),
      pressed: active(VIOLET),
    });
    await expectStates(page, page.getByRole('button', { name: 'Delete' }), {
      rest: ERROR,
      hover: hover(ERROR),
      pressed: active(ERROR),
    });
  });

  test('selected Checkbox and Switch: hover and pressed are shades of the scoped primary', async ({ page }) => {
    const violet = { rest: VIOLET, hover: hover(VIOLET), pressed: active(VIOLET) };
    await expectStates(page, page.getByRole('checkbox', { name: 'Paid' }), violet);
    const reminders = page.getByRole('switch', { name: 'Reminders' });
    await expectStates(page, reminders, violet);
    await expectStates(page, reminders, violet, 'borderTopColor');
  });

  test('Breadcrumb: the link text follows the scoped primary on hover and pressed @engines', async ({ page }) => {
    await expectStates(
      page,
      page.getByRole('link', { name: 'Invoices' }),
      { rest: VIOLET, hover: hover(VIOLET), pressed: active(VIOLET) },
      'color',
    );
  });

  test('surface-pressed is computed from the scoped surface-subtle', async ({ page }) => {
    const pressed = shade(SURFACE_SUBTLE, 96);
    await expectStates(page, page.getByRole('button', { name: 'Cancel' }), {
      rest: [255, 255, 255],
      hover: SURFACE_SUBTLE,
      pressed,
    });
    await expectStates(page, page.getByRole('checkbox', { name: 'Disputed' }), {
      rest: [255, 255, 255],
      hover: SURFACE_SUBTLE,
      pressed,
    });
  });

  test('read-only shades follow the scoped neutrals', async ({ page }) => {
    const supplier = page.getByRole('textbox', { name: /Supplier/ });
    expect(await colour(supplier)).toEqual(SURFACE_SUBTLE);
    const terms = page.getByRole('checkbox', { name: /Net 30/ });
    expect(await colour(terms)).toEqual(SURFACE_SUBTLE);
    const tick = terms.locator('xpath=following-sibling::*').first();
    expect(await colour(tick, 'color')).toEqual(TEXT_MUTED);
  });

  test('a theme inside a theme takes the closest scope @engines', async ({ page }) => {
    await expectStates(page, page.getByRole('button', { name: 'Approve nested' }), {
      rest: FOREST,
      hover: hover(FOREST),
      pressed: active(FOREST),
    });
  });

  test('outside the wrapper the default theme is untouched', async ({ page }) => {
    const channels = (name: string) =>
      page.evaluate((token) => {
        const ctx = document.createElement('canvas').getContext('2d')!;
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
      }, name) as Promise<Rgb>;
    await expectStates(page, page.getByRole('button', { name: 'Approve outside' }), {
      rest: await channels('--color-rop-blue-600'),
      hover: await channels('--color-rop-blue-700'),
      pressed: await channels('--color-rop-blue-800'),
    });
  });

  test('a derived token set directly on the wrapper wins over the computed shade, only for that state @engines', async ({ page }) => {
    await page.addStyleTag({ content: '[data-testid="scoped-theme"] { --color-rop-primary-hover: #123456; }' });
    await expectStates(page, page.getByRole('button', { name: 'Approve', exact: true }), {
      rest: VIOLET,
      hover: [18, 52, 86],
      pressed: active(VIOLET),
    });
    await expectStates(page, page.getByRole('button', { name: 'Approve outside' }), {
      rest: [10, 110, 209],
      hover: hover([10, 110, 209]),
      pressed: active([10, 110, 209]),
    });
  });

  test('a direct override is inherited by a nested theme, until that theme clears it with `initial` @engines', async ({ page }) => {
    await page.addStyleTag({ content: '[data-testid="scoped-theme"] { --color-rop-primary-hover: #123456; }' });
    const nested = page.getByRole('button', { name: 'Approve nested' });
    await nested.hover();
    expect(await colour(nested)).toEqual([18, 52, 86]);
    await page.mouse.move(0, 0);
    await page.addStyleTag({ content: '[data-testid="nested-theme"] { --color-rop-primary-hover: initial; }' });
    await nested.hover();
    expect(await colour(nested)).toEqual(hover(FOREST));
  });

  test('a base override on :root reaches the default theme and leaves the scoped one alone', async ({ page }) => {
    await page.addStyleTag({ content: ':root { --color-rop-primary: #ff0000; }' });
    await expectStates(page, page.getByRole('button', { name: 'Approve outside' }), {
      rest: [255, 0, 0],
      hover: [204, 0, 0],
      pressed: [158, 0, 0],
    });
    await expectStates(page, page.getByRole('button', { name: 'Approve', exact: true }), {
      rest: VIOLET,
      hover: hover(VIOLET),
      pressed: active(VIOLET),
    });
  });

  test('a derived token set directly on :root applies everywhere', async ({ page }) => {
    await page.addStyleTag({ content: ':root { --color-rop-error-hover: #123456; --color-rop-primary-active: #654321; }' });
    const remove = page.getByRole('button', { name: 'Delete' });
    await remove.hover();
    expect(await colour(remove)).toEqual([18, 52, 86]);
    const outside = page.getByRole('button', { name: 'Approve outside' });
    await outside.hover();
    await page.mouse.down();
    expect(await colour(outside)).toEqual([101, 67, 33]);
    await cancelPress(page);
  });

  test('declared contract: a bare var() of a derived token has no value, the fallback form does @engines', async ({ page }) => {
    const read = (value: string) =>
      page.evaluate((background) => {
        const probe = document.createElement('div');
        probe.style.backgroundColor = background;
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      }, value);
    expect(await read('var(--color-rop-primary-hover)')).toBe('rgba(0, 0, 0, 0)');
    expect(await read('var(--color-rop-primary-hover, #123456)')).toBe('rgb(18, 52, 86)');
  });

  test('declared contract: an alias of an unset derived token is ignored, the computed shade stays @engines', async ({ page }) => {
    await page.addStyleTag({ content: '[data-testid="scoped-theme"] { --color-rop-primary-active: var(--color-rop-primary-hover); }' });
    const approve = page.getByRole('button', { name: 'Approve', exact: true });
    await approve.hover();
    await page.mouse.down();
    expect(await colour(approve)).toEqual(active(VIOLET));
    await cancelPress(page);
  });

  test('declared contract: the documented recipe on the element honours overrides and the scope @engines', async ({ page }) => {
    const recipe = 'var(--color-rop-primary-hover, color-mix(in srgb, var(--color-rop-primary) 80%, black))';
    const probe = page.getByTestId('recipe-probe');
    await page.getByTestId('scoped-theme').evaluate((el, background) => {
      const element = document.createElement('div');
      element.dataset.testid = 'recipe-probe';
      element.style.backgroundColor = background;
      el.append(element);
    }, recipe);
    expect(await colour(probe)).toEqual(hover(VIOLET));
    await page.addStyleTag({ content: '[data-testid="scoped-theme"] { --color-rop-primary-hover: #123456; }' });
    expect(await colour(probe)).toEqual([18, 52, 86]);
  });

  test('declared contract: the same formula declared on :root is the original bug for inner scopes @engines', async ({ page }) => {
    await page.addStyleTag({
      content:
        ':root { --my-hover: color-mix(in srgb, var(--color-rop-primary) 80%, black); } ' +
        '[data-testid="scoped-theme"] button { outline: 2px solid var(--my-hover); }',
    });
    const outline = await page
      .getByRole('button', { name: 'Approve', exact: true })
      .evaluate((el) => {
        const ctx = document.createElement('canvas').getContext('2d')!;
        ctx.fillStyle = getComputedStyle(el).outlineColor;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
      });
    expect(outline).toEqual(hover([10, 110, 209]));
  });
});
