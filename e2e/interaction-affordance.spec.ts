import { expect, test, type Page } from '@playwright/test';
import { SELECTED_PILL, STORY, SURFACES, leave, look, paint, type Surface } from './helpers/affordance';
import { expectPlayToPass, gotoStory } from './helpers/story';

// Real computed styles under a real mouse (hover / pressed need a real pointer, a play function
// cannot simulate them). Transitions are off (reduced motion) so a style is read in its final state;
// the reduced-motion contract itself is a test of its own below.
test.use({ reducedMotion: 'reduce' });

const target = (s: Surface, page: Page) => (s.target ?? s.measure)(page);

test.describe('Foundations/Interaction states: desktop affordance', () => {
  test('the story renders and its play function passes (default, disabled, locked)', async ({ page }) => {
    await expectPlayToPass(page, STORY);
  });

  for (const s of SURFACES) {
    test(`${s.name}: pointer, hover, pressed, back to rest, no layout shift`, async ({ page }) => {
      // The play function has finished (it clicks a button and a pill): the layout is final.
      await expectPlayToPass(page, STORY);
      // In view first: a later hover would otherwise scroll it and shift the measured box.
      await s.measure(page).scrollIntoViewIfNeeded();
      await leave(page);
      const rest = await look(s.measure(page));

      await target(s, page).hover();
      const hover = await look(s.measure(page));
      expect(hover.cursor).toBe('pointer');
      expect(paint(hover), 'hover differs from rest').not.toBe(paint(rest));

      await page.mouse.down();
      const pressed = await look(s.measure(page));
      // Released away from the control: no click, so the control keeps its logical state (a click
      // would toggle a checkbox, select a pill, follow a link).
      await leave(page);
      await page.mouse.up();
      if (s.name === 'Select trigger') await page.keyboard.press('Escape');
      expect(paint(pressed), 'pressed differs from rest').not.toBe(paint(rest));
      expect(paint(pressed), 'pressed differs from hover').not.toBe(paint(hover));

      await leave(page);
      const after = await look(s.measure(page));
      expect(paint(after), 'back to rest').toBe(paint(rest));
      expect(after.cursor).toBe(rest.cursor);
      expect([hover.rect, pressed.rect, after.rect]).toEqual([rest.rect, rest.rect, rest.rect]);
    });
  }

  test('a selected pill: hover changes nothing, pressed does', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await leave(page);
    const pill = SELECTED_PILL.measure(page);
    await expect(pill).toHaveAttribute('aria-checked', 'true');
    const rest = await look(pill);
    await pill.hover();
    const hover = await look(pill);
    expect(hover.cursor).toBe('pointer');
    expect(paint(hover)).toBe(paint(rest));
    await page.mouse.down();
    const pressed = await look(pill);
    await leave(page);
    await page.mouse.up();
    expect(paint(pressed)).not.toBe(paint(rest));
    expect(pressed.rect).toBe(rest.rect);
  });

  test('a press that leaves the control before release does not stay pressed', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    const button = SURFACES[1]!.measure(page);
    const rest = await look(button);
    await button.hover();
    await page.mouse.down();
    await leave(page);
    expect(paint(await look(button))).toBe(paint(rest));
    await page.mouse.up();
  });

  test('every surface switches its transitions off under reduced motion', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    for (const s of [...SURFACES, SELECTED_PILL]) {
      const { transition } = await look(s.measure(page));
      expect(transition.split(',').every((t) => t.trim() === '0s'), `${s.name}: ${transition}`).toBe(true);
    }
  });

  test('the Select options: pointer when enabled, not-allowed when disabled, a pressed look', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await page.getByTestId('controls').locator('button[role="combobox"]').click();
    const enabled = page.getByRole('option', { name: 'Option B' });
    const disabled = page.getByRole('option', { name: /Option C/ });
    await enabled.hover();
    const highlighted = await look(enabled);
    expect(highlighted.cursor).toBe('pointer');
    expect(highlighted.background).not.toBe('rgba(0, 0, 0, 0)');
    expect((await look(disabled)).cursor).toBe('not-allowed');
    await page.mouse.down();
    const pressed = await look(enabled);
    expect(pressed.background).not.toBe(highlighted.background);
    expect(pressed.rect).toBe(highlighted.rect);
    // Released away from the option: nothing is picked.
    await leave(page);
    await page.mouse.up();
  });

  test('negative controls: text cursor on inputs, no pointer and no hover change on the rest', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    const negatives = page.getByTestId('negatives');
    expect((await look(negatives.getByRole('textbox'))).cursor).toBe('text');
    for (const el of [negatives.getByText('Card'), negatives.getByText('Approved'), negatives.getByText(/A long text/)]) {
      await leave(page);
      const rest = await look(el);
      await el.hover();
      const hover = await look(el);
      expect(hover.cursor).not.toBe('pointer');
      expect(paint(hover)).toBe(paint(rest));
    }
    await leave(page);
    const avatar = negatives.getByRole('img');
    const rest = await look(avatar);
    await avatar.hover();
    expect((await look(avatar)).cursor).not.toBe('pointer');
    expect(paint(await look(avatar))).toBe(paint(rest));
  });

  test('disabled: not-allowed, no hover change, no pressed look', async ({ page }) => {
    await expectPlayToPass(page, STORY, 'disabled:!true');
    const disabled: Surface[] = [
      ...SURFACES.filter((s) => s.name.startsWith('Button') && !s.name.includes('asChild')),
      ...SURFACES.filter((s) => /^(Select|Checkbox|Switch|Radio)/.test(s.name)),
    ];
    for (const s of disabled) {
      await leave(page);
      const rest = await look(s.measure(page));
      expect(rest.cursor, `${s.name} cursor`).toBe('not-allowed');
      await target(s, page).hover({ force: true });
      expect(paint(await look(s.measure(page))), `${s.name} hover`).toBe(paint(rest));
      await page.mouse.down();
      const pressed = await look(s.measure(page));
      await page.mouse.up();
      expect(paint(pressed), `${s.name} pressed`).toBe(paint(rest));
      expect(pressed.cursor).toBe('not-allowed');
    }
  });

  for (const state of ['forced', 'locked']) {
    test(`${state}: no click affordance (rest look, not pointer), still focusable`, async ({ page }) => {
      await expectPlayToPass(page, STORY, `state:${state}`);
      const blocked = SURFACES.filter((s) => /^(Select|Checkbox|Switch|Radio)/.test(s.name));
      for (const s of blocked) {
        await leave(page);
        const rest = await look(s.measure(page));
        expect(rest.cursor, `${s.name} cursor`).not.toBe('pointer');
        expect(rest.cursor).toBe('not-allowed');
        await target(s, page).hover();
        const hover = await look(s.measure(page));
        expect(paint(hover), `${s.name} hover`).toBe(paint(rest));
        expect(hover.cursor).not.toBe('pointer');
        await page.mouse.down();
        const pressed = await look(s.measure(page));
        if (s.name === 'Select trigger') await page.keyboard.press('Escape');
        await page.mouse.up();
        expect(paint(pressed), `${s.name} pressed`).toBe(paint(rest));
        await s.measure(page).focus();
        await expect(s.measure(page), `${s.name} focusable`).toBeFocused();
      }
    });
  }

  test('a forced Checkbox stays reachable with Tab', async ({ page }) => {
    await gotoStory(page, STORY, 'state:forced');
    const checkbox = page.getByTestId('controls').getByRole('checkbox');
    await page.getByTestId('controls').locator('button[role="combobox"]').focus();
    await page.keyboard.press('Tab');
    await expect(checkbox).toBeFocused();
  });
});
