import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

/** Gap in px between the label's bottom and the focus ring's top (outline width + offset). */
async function ringGap(page: Page, control: Locator, label: Locator): Promise<number> {
  await page.keyboard.press('Shift'); // keyboard modality so :focus-visible matches
  await control.focus();
  const outline = await control.evaluate((el) => {
    const s = getComputedStyle(el);
    return { w: parseFloat(s.outlineWidth), o: parseFloat(s.outlineOffset), style: s.outlineStyle };
  });
  expect(outline.style).toBe('solid');
  expect(outline.w).toBeGreaterThanOrEqual(2); // WCAG 2.4.11: indicator not thinned to gain space
  const c = (await control.boundingBox())!;
  const l = (await label.boundingBox())!;
  return c.y - (outline.w + outline.o) - (l.y + l.height);
}

/** Gap in px between the focus ring's bottom and the top of the FieldMessage text under it (#147). */
async function bottomGap(page: Page, control: Locator, message: Locator): Promise<number> {
  await page.keyboard.press('Shift');
  await control.focus();
  const w = await control.evaluate((el) => {
    const s = getComputedStyle(el);
    return { w: parseFloat(s.outlineWidth), o: parseFloat(s.outlineOffset) };
  });
  const c = (await control.boundingBox())!;
  const m = (await message.boundingBox())!;
  return m.y - (c.y + c.height + w.w + w.o);
}

test.describe('Field focus ring vs FieldMessage (#147)', () => {
  for (const [testId, suffix] of [
    ['f-help', 'help'],
    ['f-error', 'error'],
  ] as const) {
    test(`${suffix}: the ring keeps >=4px from the message text`, async ({ page }) => {
      await gotoStory(page, 'forms-field--overview');
      const field = page.getByTestId(testId);
      const gap = await bottomGap(page, field.getByRole('textbox'), field.locator(`[id$="-${suffix}"]`));
      expect(gap).toBeGreaterThanOrEqual(4);
    });
  }
});

test.describe('Field focus ring vs label (#138)', () => {
  test('Input: the ring keeps >=4px from the label', async ({ page }) => {
    await gotoStory(page, 'forms-field--overview');
    const field = page.getByTestId('f-plain');
    expect(await ringGap(page, field.getByRole('textbox'), field.locator('label'))).toBeGreaterThanOrEqual(4);
  });

  test('Select: the ring keeps >=4px from the label', async ({ page }) => {
    await gotoStory(page, 'forms-select--manual');
    const trigger = page.locator('button[role="combobox"]').first();
    const label = page.locator(`label[for="${await trigger.getAttribute('id')}"]`);
    expect(await ringGap(page, trigger, label)).toBeGreaterThanOrEqual(4);
  });

  test('Combobox: the ring keeps >=4px from the label', async ({ page }) => {
    await gotoStory(page, 'forms-combobox--base');
    const input = page.getByRole('combobox').first();
    const label = page.locator(`label[for="${await input.getAttribute('id')}"]`);
    expect(await ringGap(page, input, label)).toBeGreaterThanOrEqual(4);
  });
});
