import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

// The invalid state of Input, Select and Combobox is the same (#104). The pictures are the visual
// regression of `Internal/InvalidStates` (mobile, tablet, desktop); here the numbers are asserted.
const MATRIX = 'internal-invalidstates--matrix';
const KINDS = ['input', 'select', 'combobox'] as const;
type Kind = (typeof KINDS)[number];
type Variant = 'valid' | 'invalid' | 'invalid-message';

const cell = (page: Page, kind: Kind, variant: Variant) => page.getByTestId(`cell-${kind}-${variant}`);
const control = (page: Page, kind: Kind, variant: Variant) =>
  cell(page, kind, variant).getByRole(kind === 'input' ? 'textbox' : 'combobox');

interface Measure {
  height: number;
  width: number;
  border: { width: string; style: string; color: string }[];
  radius: string;
  fieldHeight: number;
  /** Top of the control relative to the top of its Field. */
  controlOffset: number;
  messageSpace: number;
  /** Height the Field always reserves for its messages (the empty message area). */
  reserved: number;
}

/** Everything the three controls must agree on, measured in the browser. */
function measure(page: Page, kind: Kind, variant: Variant): Promise<Measure> {
  return cell(page, kind, variant).evaluate((root, k) => {
    const field = root.firstElementChild as HTMLElement;
    const el = root.querySelector<HTMLElement>(k === 'input' ? 'input' : '[role=combobox]')!;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const message = root.querySelector<HTMLElement>('[id$="-error"]');
    let messageSpace = 0;
    if (message) {
      const m = getComputedStyle(message);
      messageSpace = message.getBoundingClientRect().height + parseFloat(m.marginTop) + parseFloat(m.marginBottom);
    }
    return {
      height: rect.height,
      width: rect.width,
      border: (['Top', 'Right', 'Bottom', 'Left'] as const).map((side) => ({
        width: cs.getPropertyValue(`border-${side.toLowerCase()}-width`),
        style: cs.getPropertyValue(`border-${side.toLowerCase()}-style`),
        color: cs.getPropertyValue(`border-${side.toLowerCase()}-color`),
      })),
      radius: cs.borderTopLeftRadius,
      fieldHeight: field.getBoundingClientRect().height,
      controlOffset: rect.top - field.getBoundingClientRect().top,
      messageSpace,
      reserved: parseFloat(getComputedStyle(root.querySelector<HTMLElement>('[data-field-messages]')!).minHeight),
    };
  }, kind);
}

for (const [name, viewport] of [
  ['mobile', { width: 375, height: 667 }],
  ['tablet', { width: 768, height: 1024 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(`invalid states matrix (${name})`, () => {
    test.use({ viewport });

    test('the play function passes and nothing overflows the viewport', async ({ page }) => {
      await expectPlayToPass(page, MATRIX);
      await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    });

    test('the invalid border is the same on Input, Select and Combobox, with and without message, and differs from the valid one', async ({
      page,
    }) => {
      await gotoStory(page, MATRIX);
      const valid = await measure(page, 'input', 'valid');
      const reference = await measure(page, 'input', 'invalid');
      // The invalid border really is a different colour from the valid one (the style did something).
      expect(reference.border[0]!.color).not.toBe(valid.border[0]!.color);
      for (const side of reference.border) expect(side.style).toBe('solid');
      for (const kind of KINDS) {
        for (const variant of ['invalid', 'invalid-message'] as const) {
          const m = await measure(page, kind, variant);
          expect(m.border, `${kind} ${variant} border`).toEqual(reference.border);
          expect(m.radius, `${kind} ${variant} radius`).toBe(reference.radius);
        }
        // Valid is the same on all three too, and the same width as the invalid one.
        expect((await measure(page, kind, 'valid')).border).toEqual(valid.border);
      }
    });

    test('the height of the invalid control is the same on the three, and the same as the valid one', async ({ page }) => {
      await gotoStory(page, MATRIX);
      const reference = (await measure(page, 'input', 'valid')).height;
      expect(reference).toBe(36); // md: 32px line + paddings + borders (the height of Button md)
      for (const kind of KINDS) {
        for (const variant of ['valid', 'invalid', 'invalid-message'] as const) {
          expect((await measure(page, kind, variant)).height, `${kind} ${variant}`).toBe(reference);
        }
      }
    });

    test('the message adds only its own room under the control: same control position and width, same extra height', async ({ page }) => {
      await gotoStory(page, MATRIX);
      for (const kind of KINDS) {
        const without = await measure(page, kind, 'invalid');
        const withMessage = await measure(page, kind, 'invalid-message');
        // The control does not move or resize because of the message.
        expect(withMessage.controlOffset, kind).toBe(without.controlOffset);
        // (Sub-pixel tolerance: the two cells are different tracks of a fractional grid.)
        expect(Math.abs(withMessage.width - without.width), kind).toBeLessThan(0.5);
        expect(withMessage.height, kind).toBe(without.height);
        // The Field grows only by what the message needs beyond the reserved room (#140: nothing for one line).
        expect(withMessage.messageSpace, kind).toBeGreaterThan(0);
        expect(without.reserved, kind).toBeGreaterThan(0);
        expect(withMessage.fieldHeight - without.fieldHeight, kind).toBeCloseTo(Math.max(0, withMessage.messageSpace - without.reserved), 1);
        expect(without.messageSpace, kind).toBe(0);
      }
      // The same extra room on the three controls.
      const extras = await Promise.all(
        KINDS.map(async (kind) => (await measure(page, kind, 'invalid-message')).fieldHeight - (await measure(page, kind, 'invalid')).fieldHeight),
      );
      expect(new Set(extras.map((e) => Math.round(e * 10))).size).toBe(1);
    });

    test('the three controls share the same width in a column, invalid or not', async ({ page }) => {
      await gotoStory(page, MATRIX);
      const widths = await Promise.all(KINDS.map(async (kind) => (await measure(page, kind, 'invalid-message')).width));
      expect(new Set(widths.map(Math.round)).size).toBe(1);
    });
  });
}

test.describe('invalid states matrix (size sm)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the small scale also has the same height on the three controls, invalid or not', async ({ page }) => {
    await gotoStory(page, MATRIX, 'size:sm');
    const reference = (await measure(page, 'input', 'valid')).height;
    expect(reference).toBe(32);
    for (const kind of KINDS) {
      for (const variant of ['valid', 'invalid', 'invalid-message'] as const) {
        expect((await measure(page, kind, variant)).height, `${kind} ${variant}`).toBe(reference);
      }
    }
  });
});

test.describe('the invalid control keeps a visible focus ring', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Tab to each invalid control: the focus outline is drawn on the three', async ({ page }) => {
    await gotoStory(page, MATRIX);
    for (const kind of KINDS) {
      await control(page, kind, 'invalid-message').focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      const outline = await control(page, kind, 'invalid-message').evaluate((el) => {
        const cs = getComputedStyle(el);
        return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
      });
      expect(outline, kind).toEqual({ style: 'solid', width: 2 });
    }
  });
});
