import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const OVERVIEW = 'forms-field--overview';

/** Counts native `input` events (the ones a user gesture produces) on the page's text inputs. */
async function countInputEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __inputEvents: number };
    w.__inputEvents = 0;
    document.addEventListener('input', () => (w.__inputEvents += 1), true);
  });
}
const inputEvents = (page: Page) => page.evaluate(() => (window as unknown as { __inputEvents: number }).__inputEvents);

test.describe('Forms/Field', () => {
  test('the visual matrix passes axe, and every aria-describedby id resolves', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    await expectNoA11yViolations(page);
    const dangling = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[aria-describedby]')).flatMap((el) =>
        (el.getAttribute('aria-describedby') ?? '')
          .split(' ')
          .filter((id) => !document.getElementById(id))
          .map((id) => `${el.tagName}#${el.id} -> ${id}`),
      ),
    );
    expect(dangling).toEqual([]);
  });

  test('the input is 36px tall and exactly as wide as its Field (no preflight: padding must not overflow)', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const field = page.getByTestId('f-plain');
    const box = await field.getByRole('textbox').boundingBox();
    const outer = await field.boundingBox();
    expect(box?.height).toBe(36);
    expect(box?.width).toBe(outer?.width);
  });

  test('the input shows a visible focus ring', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    await expectFocusRingVisible(page.getByTestId('f-plain').getByRole('textbox'));
    await expectFocusRingVisible(page.getByTestId('f-forced').getByRole('textbox'));
  });

  test('required keeps the accessible name; forced and locked announce the reason', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    await expect(page.getByRole('textbox', { name: 'Obbligatorio', exact: true })).toHaveAttribute('aria-required', 'true');
    const forced = page.getByRole('textbox', { name: 'Forzato', exact: true });
    await expect(forced).toHaveAccessibleDescription('Imposto dal listino.');
    await expect(forced).toHaveAttribute('aria-readonly', 'true');
    await expect(page.getByRole('textbox', { name: 'Disabilitato' })).toBeDisabled();
  });

  test('the story play functions pass', async ({ page }) => {
    for (const id of ['playground', 'forced', 'forced-number', 'external-value', 'render-prop-locked', 'hook-toggle-enabled']) {
      await expectPlayToPass(page, `forms-field--${id}`);
    }
  });

  test('forced: real typing, Ctrl+V and Backspace change nothing and fire no input event', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await gotoStory(page, 'forms-field--forced');
    const input = page.getByRole('textbox', { name: 'Ragione sociale' });
    await page.evaluate(() => navigator.clipboard.writeText('incollato'));
    await input.focus();
    await countInputEvents(page);
    await page.keyboard.type('abc');
    await page.keyboard.press('Control+V');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await expect(input).toHaveValue('Listino A');
    expect(await inputEvents(page)).toBe(0);
  });

  test('forced type=number: arrows and the mouse wheel do not change the value', async ({ page }) => {
    await gotoStory(page, 'forms-field--forced-number');
    const input = page.getByRole('spinbutton', { name: 'Quantità' });
    await input.focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    await input.hover();
    await page.mouse.wheel(0, -200);
    await expect(input).toHaveValue('5');
  });

  test('render-prop locked control: click, Space and Enter do not switch it', async ({ page }) => {
    await gotoStory(page, 'forms-field--render-prop-locked');
    const toggle = page.getByRole('switch', { name: 'Attivo' });
    await expect(toggle).toHaveAccessibleDescription("Gestito dall'amministratore");
    await toggle.click();
    await toggle.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  test('useFieldControl in a child of an unblocked Field lets the control switch', async ({ page }) => {
    await gotoStory(page, 'forms-field--hook-toggle-enabled');
    const toggle = page.getByRole('switch', { name: 'Notifiche' });
    // The story's play function has already clicked it once: start from whatever state it is in.
    const before = await toggle.getAttribute('aria-checked');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
  });

  test('a value set from outside after mount fires no input event; typing does', async ({ page }) => {
    await gotoStory(page, 'forms-field--external-value');
    const input = page.getByRole('textbox', { name: 'Ragione sociale' });
    await countInputEvents(page);
    await page.getByRole('button', { name: 'Carica dati' }).click();
    await expect(input).toHaveValue('Acme S.p.A.');
    expect(await inputEvents(page)).toBe(0);
    await input.focus();
    await page.keyboard.type('!');
    expect(await inputEvents(page)).toBe(1);
  });

  test('a long label and a long reason wrap inside a 240px column without horizontal overflow', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    await expectNoHorizontalOverflow(page.getByTestId('f-narrow'));
  });
});

test.describe('Forms/Field: reserved message space', () => {
  const STORY = 'forms-field--error-reserves-space';
  const metrics = async (page: Page) => ({
    secondTop: (await page.getByTestId('er-second').boundingBox())!.y,
    firstHeight: (await page.getByTestId('er-first').boundingBox())!.height,
  });

  test('a one-line error appearing or going away does not move the next field', async ({ page }) => {
    await gotoStory(page, STORY);
    const before = await metrics(page);
    await page.getByRole('button', { name: 'Show error', exact: true }).click();
    await expect(page.getByText('Enter a valid VAT number.')).toBeVisible();
    expect(await metrics(page)).toEqual(before);
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByText('Enter a valid VAT number.')).toHaveCount(0);
    expect(await metrics(page)).toEqual(before);
  });

  test('a wrapped error moves the next field by exactly the extra height', async ({ page }) => {
    await gotoStory(page, STORY);
    const before = await metrics(page);
    await page.getByRole('button', { name: 'Show long error' }).click();
    const box = (await page.locator('[id$="-error"]').boundingBox())!;
    expect(box.height).toBeGreaterThan(32); // two lines or more
    const after = await metrics(page);
    // Reserved: 4px gap + 16px line. Actual: 4px gap + the message height (the gap is outside the box).
    expect(after.secondTop - before.secondTop).toBe(box.height - 16);
  });

  test('the play function passes', async ({ page }) => {
    await expectPlayToPass(page, STORY);
  });
});

// Keyboard-safe focus (spec §1.10). A desktop browser has no on-screen keyboard, so the visual
// viewport is replaced by a controllable stand-in: `__setKeyboard(px)` shrinks it from the bottom
// and fires `resize`, which is what a real virtual keyboard does to `window.visualViewport`.
for (const [name, viewport] of [
  ['mobile', { width: 375, height: 667 }],
  ['tablet', { width: 768, height: 1024 }],
] as const) {
  test.describe(`keyboard-safe focus (${name})`, () => {
    test.use({ viewport, hasTouch: true });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const target = new EventTarget();
        let keyboard = 0;
        // Getters defined on the target itself (Object.assign would copy their current value).
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

    test('the focused input is not left under the virtual keyboard, and the inset is released on blur', async ({ page }) => {
      await gotoStory(page, 'forms-field--keyboard-safe');
      const input = page.getByRole('textbox', { name: 'Indirizzo di fatturazione' });
      // Bring the field to the very bottom edge of the screen: visible now, covered by the keyboard later.
      await input.evaluate((el) => el.scrollIntoView({ block: 'end' }));
      const keyboard = Math.round(viewport.height * 0.45);
      const bottom = () => input.evaluate((el) => el.getBoundingClientRect().bottom);
      expect(await bottom()).toBeGreaterThan(viewport.height - keyboard);

      await input.focus();
      await page.evaluate((px) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(px), keyboard);

      await expect.poll(bottom).toBeLessThanOrEqual(viewport.height - keyboard);
      expect(await input.evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--rop-keyboard-inset'))).toBe(`${keyboard}px`);

      await input.blur();
      await page.evaluate(() => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(0));
      expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--rop-keyboard-inset'))).toBe('');
    });

    test('a field already above the keyboard is not scrolled', async ({ page }) => {
      await gotoStory(page, 'forms-field--keyboard-safe');
      const input = page.getByRole('textbox', { name: 'Indirizzo di fatturazione' });
      await page.getByTestId('kb-field').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      expect(await input.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThan(250);
      const before = await page.evaluate(() => window.scrollY);
      await input.focus();
      await page.evaluate(() => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(250));
      expect(await page.evaluate(() => window.scrollY)).toBe(before);
    });
  });
}
