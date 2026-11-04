import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `forms-switch--${name}`;
const toggle = (page: Page): Locator => page.getByRole('switch');
const FIELD_LABEL = (page: Page) => page.locator('label', { hasText: /^Notifications$/ });
const INLINE = 'Email notifications';

/** Signed distance between the centre of the thumb and the centre of the track (negative = left). */
const thumbOffset = (el: Locator) =>
  el.evaluate((input) => {
    const track = input.getBoundingClientRect();
    const thumb = input.nextElementSibling!.getBoundingClientRect();
    return thumb.left + thumb.width / 2 - (track.left + track.width / 2);
  });

test.describe('Forms/Switch: stories play', () => {
  for (const name of ['playground', 'async-hydration', 'async-save', 'uncontrolled-blocked-walkthrough']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('mouse and keyboard (default)', () => {
  test('click on the track, on the inline label and on the Field label toggle it; Space too', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const el = toggle(page);
    await expect(el).not.toBeChecked();
    await el.click();
    await expect(el).toBeChecked();
    await page.getByText(INLINE).click();
    await expect(el).not.toBeChecked();
    await FIELD_LABEL(page).click();
    await expect(el).toBeChecked();
    await page.mouse.click(2, 2);
    await page.keyboard.press('Tab');
    await expect(el).toBeFocused();
    await page.keyboard.press('Space');
    await expect(el).not.toBeChecked();
  });

  test('Enter does not toggle it', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(toggle(page)).not.toBeChecked();
  });

  test('the row is at least 24px tall, the track is at least 24px wide and the focus ring is visible', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const box = (await toggle(page).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(24);
    expect(box.width).toBeGreaterThanOrEqual(24);
    await page.keyboard.press('Tab');
    await expectFocusRingVisible(toggle(page));
  });
});

test.describe('state without colour', () => {
  test('the thumb centre is left of the track centre when off and right of it when on, in the same place', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const el = toggle(page);
    const off = await thumbOffset(el);
    expect(off).toBeLessThan(0);
    await el.click();
    await expect.poll(() => thumbOffset(el)).toBeGreaterThan(0);
    expect(Math.abs((await thumbOffset(el)) + off)).toBeLessThan(1);
  });

  test('the width of the row does not change between on and off', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const row = page.locator('label', { has: toggle(page) });
    const before = (await row.boundingBox())!.width;
    await toggle(page).click();
    await expect(toggle(page)).toBeChecked();
    expect((await row.boundingBox())!.width).toBe(before);
  });

  test('RTL: the thumb starts on the right and moves to the left', async ({ page }) => {
    await gotoStory(page, STORY('rtl'));
    const [off, on] = [toggle(page).nth(0), toggle(page).nth(1)];
    await expect(on).toBeChecked();
    expect(await thumbOffset(off)).toBeGreaterThan(0);
    expect(await thumbOffset(on)).toBeLessThan(0);
  });

  test('forced-colors: on and off differ by thumb position and by colour', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await gotoStory(page, STORY('state-matrix'));
    const read = async (name: string) =>
      page
        .locator('label', { hasText: new RegExp(`^${name} / default$`) })
        .locator('xpath=..')
        .evaluate((cell) => {
          const input = cell.querySelector('input')!;
          const thumb = input.nextElementSibling!;
          const track = input.getBoundingClientRect();
          const t = thumb.getBoundingClientRect();
          return {
            offset: t.left + t.width / 2 - (track.left + track.width / 2),
            thumb: getComputedStyle(thumb).backgroundColor,
            trackBg: getComputedStyle(input).backgroundColor,
            border: getComputedStyle(input).borderTopColor,
          };
        });
    const off = await read('Off');
    const on = await read('On');
    expect(off.offset).toBeLessThan(0);
    await expect.poll(async () => (await read('On')).offset).toBeGreaterThan(0);
    // The thumb never disappears into the track.
    expect(off.thumb).not.toBe(off.trackBg);
    expect(on.thumb).not.toBe(on.trackBg);
    expect(on.trackBg).not.toBe(off.trackBg);
  });
});

test.describe('motion', () => {
  test('with reduced motion the thumb is immediately in the final position', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoStory(page, STORY('manual'));
    const el = toggle(page);
    const off = await thumbOffset(el);
    await el.click();
    // Read in the same task as the click result: no transition may be running.
    const after = await el.evaluate((input) => {
      const thumb = input.nextElementSibling as HTMLElement;
      const track = input.getBoundingClientRect();
      const t = thumb.getBoundingClientRect();
      return {
        offset: t.left + t.width / 2 - (track.left + track.width / 2),
        duration: getComputedStyle(thumb).transitionDuration,
        running: thumb.getAnimations().length,
      };
    });
    expect(after.offset).toBeCloseTo(-off, 0);
    expect(after.duration).toBe('0s');
    expect(after.running).toBe(0);
  });

  test('without reduced motion the thumb has the feedback transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoStory(page, STORY('manual'));
    const duration = await toggle(page).evaluate(
      (input) => getComputedStyle(input.nextElementSibling!).transitionDuration,
    );
    expect(duration).toBe('0.12s');
  });
});

const GESTURES: Array<[string, (page: Page) => Promise<void>]> = [
  ['click on the track', async (page) => toggle(page).click()],
  ['click on the inline label', async (page) => page.getByText(INLINE).click()],
  ['click on the Field label', async (page) => FIELD_LABEL(page).click()],
  [
    'Space',
    async (page) => {
      await toggle(page).focus();
      await page.keyboard.press('Space');
    },
  ],
];
const calls = (page: Page) => page.getByTestId('calls');

for (const state of ['forced', 'locked'] as const) {
  test.describe(`${state}`, () => {
    test('Tab reaches it, aria-readonly, described by the reason, focus ring visible', async ({ page }) => {
      await gotoStory(page, STORY('manual'), `fieldState:${state};checked:!true`);
      const el = toggle(page);
      await page.keyboard.press('Tab');
      await expect(el).toBeFocused();
      await expect(el).toHaveAttribute('aria-readonly', 'true');
      await expect(el).toHaveAccessibleDescription(/Decided by the framework agreement/);
      await expectFocusRingVisible(el);
    });

    for (const initial of [true, false]) {
      for (const [name, gesture] of GESTURES) {
        const start = initial ? 'on' : 'off';
        test(`controlled, ${name}, starting ${start}: state unchanged`, async ({ page }) => {
          await gotoStory(page, STORY('manual'), `fieldState:${state};checked:!${initial}`);
          await expect(toggle(page)).toBeChecked({ checked: initial });
          const off = await thumbOffset(toggle(page));
          await gesture(page);
          await expect(toggle(page)).toBeChecked({ checked: initial });
          await gesture(page);
          await expect(toggle(page)).toBeChecked({ checked: initial });
          expect(await thumbOffset(toggle(page))).toBeCloseTo(off, 0);
        });

        test(`uncontrolled, ${name}, starting ${start}: state unchanged and nothing reported`, async ({ page }) => {
          await gotoStory(page, STORY('uncontrolled-blocked'), `fieldState:${state};checked:!${initial}`);
          await expect(toggle(page)).toBeChecked({ checked: initial });
          await gesture(page);
          await expect(toggle(page)).toBeChecked({ checked: initial });
          await gesture(page);
          await expect(toggle(page)).toBeChecked({ checked: initial });
          await expect(calls(page)).toHaveText('[]');
        });
      }
    }

    test('uncontrolled: after blocked gestures and unlocking, a normal click toggles and reports', async ({ page }) => {
      await gotoStory(page, STORY('uncontrolled-blocked'), `fieldState:${state}`);
      for (const [, gesture] of GESTURES) await gesture(page);
      await expect(toggle(page)).not.toBeChecked();
      await page.getByRole('button', { name: 'Unlock' }).click();
      await expect(toggle(page)).not.toHaveAttribute('aria-readonly', 'true');
      await toggle(page).click();
      await expect(toggle(page)).toBeChecked();
      await expect(calls(page)).toHaveText('[true]');
      await toggle(page).click();
      await expect(toggle(page)).not.toBeChecked();
      await expect(calls(page)).toHaveText('[true,false]');
    });
  });
}

test.describe('uncontrolled in a form', () => {
  test('after Reset the next click still reports', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled-blocked'));
    await page.getByRole('button', { name: 'Unlock' }).click();
    await toggle(page).click();
    await expect(calls(page)).toHaveText('[true]');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(toggle(page)).not.toBeChecked();
    await toggle(page).click();
    await expect(toggle(page)).toBeChecked();
    await expect(calls(page)).toHaveText('[true,true]');
  });
});

test.describe('Field that becomes locked while focused', () => {
  test('the focus stays on the switch and Space no longer changes it', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await expect(toggle(page)).toBeChecked();
    // The button takes the focus, then returns it to the switch: the Field is now forced.
    await page.getByRole('button', { name: 'Force this value' }).click();
    await expect(toggle(page)).toHaveAttribute('aria-readonly', 'true');
    await toggle(page).focus();
    await page.keyboard.press('Space');
    await expect(toggle(page)).toBeFocused();
    await expect(toggle(page)).toBeChecked();
  });
});

test.describe('disabled', () => {
  test('out of the tab order and no click changes it', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'fieldState:disabled');
    const el = toggle(page);
    await expect(el).toBeDisabled();
    await page.keyboard.press('Tab');
    await expect(el).not.toBeFocused();
    // `force`: Playwright otherwise waits for a label of a disabled control to become enabled.
    await page.getByText(INLINE).click({ force: true });
    await FIELD_LABEL(page).click({ force: true });
    await el.click({ force: true });
    await expect(el).not.toBeChecked();
  });
});

test.describe('form', () => {
  test('submits name only when on; Reset goes back to defaultChecked', async ({ page }) => {
    await gotoStory(page, STORY('in-form'));
    const news = page.getByRole('switch', { name: 'Newsletter' });
    const alerts = page.getByRole('switch', { name: 'Alerts' });
    await expect(news).toBeChecked();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('form')).toHaveAttribute('data-submitted', '["news"]');
    await news.click();
    await alerts.click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('form')).toHaveAttribute('data-submitted', '["alerts"]');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(news).toBeChecked();
    await expect(alerts).not.toBeChecked();
  });
});

test.describe('layout', () => {
  test('375px: the matrix and the long label do not overflow, the switch stays on top of a wrapped label', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, STORY('field-messages'));
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    const long = page.getByRole('switch', { name: /Digest/ });
    const label = page.locator('label', { has: long });
    const top = (await long.boundingBox())!.y;
    const labelBox = (await label.boundingBox())!;
    expect(labelBox.height).toBeGreaterThan(48);
    expect(top - labelBox.y).toBeLessThan(12);
    await gotoStory(page, STORY('state-matrix'));
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
  });
});

test.describe('accessibility', () => {
  for (const name of ['manual', 'state-matrix', 'field-messages', 'rtl']) {
    test(`${name}: no axe violations`, async ({ page }) => {
      await gotoStory(page, STORY(name));
      await expectNoA11yViolations(page);
    });
  }

  test('forced and invalid states: no axe violations', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'fieldState:forced;invalid:!true;required:!true');
    await expectNoA11yViolations(page);
  });
});

// #223: the UncontrolledBlocked Controls act on the DOM, and Lock / Unlock switch the Field state
// after mount (dashed <-> solid) without remounting the switch.
test.describe('UncontrolledBlocked: Controls and Lock / Unlock', () => {
  const lockButton = (page: Page) => page.getByRole('button', { name: 'Lock', exact: true });
  const unlockButton = (page: Page) => page.getByRole('button', { name: 'Unlock', exact: true });
  const borderStyle = (page: Page) => toggle(page).evaluate((el) => getComputedStyle(el).borderTopStyle);

  test('without arguments it starts locked; fieldState:default starts it editable', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled-blocked'));
    await expect(toggle(page)).toHaveAttribute('aria-readonly', 'true');
    await expect(page.getByTestId('field-state')).toHaveText('locked');
    await expect(lockButton(page)).toBeDisabled();
    await gotoStory(page, STORY('uncontrolled-blocked'), 'fieldState:default');
    await expect(toggle(page)).not.toHaveAttribute('aria-readonly');
    await expect(page.getByTestId('field-state')).toHaveText('default');
    await expect(unlockButton(page)).toBeDisabled();
    await toggle(page).click();
    await expect(toggle(page)).toBeChecked();
    await expect(calls(page)).toHaveText('[true]');
  });

  test('invalid and required reach the switch as aria-invalid and aria-required', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled-blocked'), 'invalid:!true;required:!true');
    await expect(toggle(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(toggle(page)).toHaveAttribute('aria-required', 'true');
    await gotoStory(page, STORY('uncontrolled-blocked'));
    await expect(toggle(page)).not.toHaveAttribute('aria-invalid');
    await expect(toggle(page)).not.toHaveAttribute('aria-required');
  });

  test('fieldLabel is part of the accessible name', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled-blocked'), 'fieldLabel:Consent');
    await expect(toggle(page)).toHaveAccessibleName(/Consent/);
    await expect(page.locator('label', { hasText: /^Consent$/ })).toBeVisible();
  });

  test('Lock / Unlock alternate the dashed and the solid border; the value stays (no remount)', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled-blocked'), 'fieldState:default');
    expect(await borderStyle(page)).toBe('solid');
    await toggle(page).click();
    const node = await toggle(page).elementHandle();
    await lockButton(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-readonly', 'true');
    expect(await borderStyle(page)).toBe('dashed');
    await expect(toggle(page)).toBeChecked();
    expect(await node!.evaluate((el) => el.isConnected)).toBe(true);
    await unlockButton(page).click();
    await expect(toggle(page)).not.toHaveAttribute('aria-readonly');
    expect(await borderStyle(page)).toBe('solid');
    await expect(toggle(page)).toBeChecked();
    await expect(calls(page)).toHaveText('[true]');
  });

  test('checked:!true mounts the switch on and reports nothing', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled-blocked'), 'checked:!true');
    await expect(toggle(page)).toBeChecked();
    await expect(calls(page)).toHaveText('[]');
  });
});
