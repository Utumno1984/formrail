import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { parseDerivedTokens } from '../packages/core/src/utils/token-scale';
import { gotoStory } from './helpers/story';

// The copy-paste examples of the Foundations pages (ticket #446): the code a reader pastes uses only tokens
// the stylesheet really declares, and does what its comments promise.

const SRC = resolve(fileURLToPath(new URL('.', import.meta.url)), '../packages/core/src');
const EXAMPLES = ['icon/Icon', 'foundations/Theming', 'foundations/Tokens', 'typography/Typography', 'utils/Utilities'].map((name) => `${name}.example.tsx`);
const tokensCss = readFileSync(resolve(SRC, 'styles/tokens.css'), 'utf8');

// A bare read of a derived token: `var(--token)` with optional whitespace and no fallback. The README recipe
// `var(--token, color-mix(...))` carries a fallback, so it is allowed.
const bareVar = (token: string) => new RegExp(`var\\(\\s*${token}\\s*\\)`);

test.describe('Foundations examples: tokens', () => {
  test('every library token an example reads or redeclares is declared in tokens.css', () => {
    const cited = new Set<string>();
    for (const file of EXAMPLES) {
      const text = readFileSync(resolve(SRC, file), 'utf8');
      for (const match of text.matchAll(/(?:var\(\s*|['"])(--[\w-]*-rop-[\w-]+)/g)) cited.add(match[1]!);
    }
    // The scan finds the tokens at all (a broken regex would pass vacuously).
    expect(cited.has('--color-rop-primary')).toBe(true);
    expect(cited.size).toBeGreaterThan(8);
    for (const token of cited) {
      expect(tokensCss, `${token} is not declared in tokens.css`).toMatch(new RegExp(`^\\s*${token}\\s*:`, 'm'));
    }
  });

  test('the examples never invite a derived token read with a bare var() or a wrapper override of --animate-rop-*', () => {
    const derived = [...parseDerivedTokens(tokensCss).keys()];
    expect(derived.length).toBeGreaterThan(0);
    for (const file of EXAMPLES) {
      const text = readFileSync(resolve(SRC, file), 'utf8');
      expect(text, `${file}: animate token`).not.toContain('--animate-rop');
      for (const token of derived) expect(text, `${file}: bare var(${token})`).not.toMatch(bareVar(token));
    }
  });

  test('the bare-var guard rejects var() without a fallback, spaces included, and accepts the README recipe', () => {
    const token = '--color-rop-primary-hover';
    expect(`color: var(${token});`).toMatch(bareVar(token));
    expect(`color: var( ${token} );`).toMatch(bareVar(token));
    expect(`color: var(${token}, color-mix(in srgb, var(--color-rop-primary) 80%, black));`).not.toMatch(bareVar(token));
    expect(`color: var( ${token} , #123456);`).not.toMatch(bareVar(token));
  });
});

test.describe('Foundations examples', () => {
  test('Theming: a component inside the wrapper takes the redeclared value, one outside keeps the default', async ({ page }) => {
    await gotoStory(page, 'foundations-theming--example');
    const inside = page.getByRole('button', { name: 'Approve', exact: true });
    const outside = page.getByRole('button', { name: 'Approve (default theme)' });
    const background = (button: typeof inside) => button.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await background(inside)).toBe('rgb(107, 63, 160)');
    expect(await background(outside)).toBe('rgb(10, 110, 209)');
    // The radius token redeclared on the wrapper is actually used by the components inside it only.
    const radius = (locator: typeof inside) => locator.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    expect(await radius(inside)).toBe('16px');
    expect(await radius(page.getByRole('textbox', { name: 'Supplier' }))).toBe('16px');
    expect(await radius(outside)).toBe('8px');
  });

  test('Tokens: the panel built from tokens paints them', async ({ page }) => {
    await gotoStory(page, 'foundations-tokens--example');
    const panel = page.getByText('Invoice INV-2026-00042').locator('..');
    const style = await panel.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { background: cs.backgroundColor, color: cs.color, border: cs.borderTopLeftRadius, mono: getComputedStyle(el.querySelector('code')!).fontFamily };
    });
    expect(style.background).toBe('rgb(255, 255, 255)');
    expect(style.color).toBe('rgb(29, 45, 62)');
    expect(style.border).toBe('8px');
    expect(style.mono).toContain('monospace');
    expect(await page.getByText('Payment overdue').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(210, 10, 10)');
  });

  test('Icon: the labelled icon is an image, the decorative ones are hidden from the accessibility tree', async ({ page }) => {
    await gotoStory(page, 'foundations-icon--example');
    const named = page.getByRole('img', { name: 'Payment overdue' });
    await expect(named).toHaveCount(1);
    expect((await named.boundingBox())?.width).toBe(24);
    await expect(page.getByRole('img')).toHaveCount(1); // the two decorative icons are not images
    await expect(page.locator('svg[aria-hidden="true"]')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible();
  });

  test('Typography: heading levels, and the Text label focuses its field', async ({ page }) => {
    await gotoStory(page, 'foundations-typography--example');
    await expect(page.getByRole('heading', { level: 1, name: 'Invoice approvals' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Open invoices' })).toBeVisible();
    await page.getByText('Supplier code').click();
    await expect(page.getByRole('textbox', { name: 'Supplier code' })).toBeFocused();
    const mono = await page.getByText('INV-2026-00042').evaluate((el) => getComputedStyle(el));
    expect(mono.fontFamily).toContain('monospace');
    expect(mono.fontSize).toBe('12px');
  });

  test('Utilities: cn resolves the conflict, composeRefs feeds both refs', async ({ page }) => {
    await gotoStory(page, 'foundations-utilities--example');
    await expect(page.getByText('px-2 py-1')).toHaveCount(0); // the conflicting px-2 is gone
    await expect(page.locator('#storybook-root code').first()).toHaveText('py-1 px-4');
    await expect(page.locator('#storybook-root code').nth(1)).toHaveText('text-rop-body text-rop-error font-rop-mono');
    await expect(page.locator('output')).toHaveText('not measured');
    await page.getByRole('button', { name: 'Measure (own ref)' }).click();
    await expect(page.locator('output')).toHaveText(/^\d+px wide$/);
    await expect(page.locator('output')).not.toHaveText('0px wide');
    await page.getByRole('button', { name: 'Focus (forwarded ref)' }).click();
    await expect(page.getByRole('textbox', { name: 'Supplier' })).toBeFocused();
  });
});
