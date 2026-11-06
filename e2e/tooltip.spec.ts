import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory as openStory } from './helpers/story';

const STORY = (name: string) => `overlays-tooltip--${name}`;

// Every story but the fixture has a play function that hovers with synthetic events. The tests that
// drive the real mouse and keyboard start after it, from the clean state it ends in (see `settle`
// in the stories); `inside-dialog-manual` has no play and is opened as is.
const WITHOUT_PLAY = new Set([STORY('inside-dialog-manual'), STORY('opened-by-arrow-down')]);
async function gotoStory(page: Page, id: string, args?: string): Promise<void> {
  if (WITHOUT_PLAY.has(id)) await openStory(page, id, args);
  else await expectPlayToPass(page, id, args);
}

const tooltips = (page: Page): Locator => page.getByRole('tooltip');
// Longer than the longest delay used below, so "nothing opened" is not just "not yet".
const SETTLE = 900;

test.describe('Overlays/Tooltip: stories play', () => {
  for (const name of [
    'playground',
    'sides',
    'long-text',
    'viewport-edge',
    'inside-dialog',
    'disabled-trigger',
    'empty-content',
    'auto-focus',
    'toolbar',
    'clipped-and-in-sheet',
    'click-action',
    'content-changes-while-open',
  ]) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('hover', () => {
  test('opens after the default delay (500ms), describes the trigger, closes when the pointer leaves', async ({ page }) => {
    await gotoStory(page, STORY('playground'));
    const trigger = page.getByRole('button', { name: 'Delete row' });
    await expect(tooltips(page)).toHaveCount(0);
    // The play function closed a tooltip a moment ago: wait out the provider's skip window (300ms),
    // otherwise the next one opens with no delay (that is the toolbar test below).
    await page.waitForTimeout(450);
    await trigger.hover();
    // Not yet: most of the 500ms delay is still to go (a 200ms delay would fail here).
    await page.waitForTimeout(350);
    await expect(tooltips(page)).toHaveCount(0);
    const tooltip = tooltips(page);
    await expect(tooltip).toHaveText('Delete row');
    const id = await tooltip.getAttribute('id');
    await expect(trigger).toHaveAttribute('aria-describedby', id!);
    // A hand makes many moves; Radix closes it on the first one that leaves the grace area.
    await page.mouse.move(600, 600, { steps: 8 });
    await expect(tooltip).toHaveCount(0);
    await expect(trigger).not.toHaveAttribute('aria-describedby');
  });

  test('hovering the tooltip keeps it open (hoverable); leaving both closes it; it never takes the focus', async ({ page }) => {
    await gotoStory(page, STORY('playground'), 'delayDuration:0');
    const trigger = page.getByRole('button', { name: 'Delete row' });
    await trigger.hover();
    const tooltip = tooltips(page);
    await expect(tooltip).toBeVisible();
    const box = (await tooltip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
    await page.waitForTimeout(300);
    await expect(tooltip).toBeVisible();
    expect(await tooltip.getAttribute('tabindex')).toBeNull();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await page.mouse.move(700, 700, { steps: 5 });
    await expect(tooltip).toHaveCount(0);
  });

  test('moving between adjacent triggers opens the next one without the delay and closes the first', async ({ page }) => {
    await gotoStory(page, STORY('toolbar'));
    const first = page.getByRole('button', { name: 'Edit' });
    const second = page.getByRole('button', { name: 'Duplicate' });
    await first.hover();
    await expect(tooltips(page)).toHaveText('Edit', { timeout: 3000 });
    const target = (await second.boundingBox())!;
    // A real hand-movement across the gap (Radix ignores the first move while the pointer is "in
    // transit" between two triggers).
    await page.mouse.move(target.x + 16, target.y + 16, { steps: 12 });
    // The provider's delay is 600ms: the second is open well before it has elapsed.
    await expect(tooltips(page)).toHaveText('Duplicate', { timeout: 450 });
    await expect(tooltips(page)).toHaveCount(1);
  });

  test('a click on the trigger closes it and runs the action', async ({ page }) => {
    await gotoStory(page, STORY('click-action'));
    const trigger = page.getByRole('button', { name: 'Count' });
    await trigger.hover();
    await expect(tooltips(page)).toHaveText('Clicked 0 times');
    await trigger.click();
    await expect(tooltips(page)).toHaveCount(0);
    // Radix does not reopen it until the pointer has left the trigger and come back.
    await page.mouse.move(600, 600, { steps: 8 });
    await trigger.hover();
    await expect(tooltips(page)).toHaveText('Clicked 1 times');
  });
});

test.describe('keyboard', () => {
  test('Tab to the trigger opens it; moving the focus away closes it', async ({ page }) => {
    await gotoStory(page, STORY('toolbar'));
    await expect(tooltips(page)).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Edit' })).toBeFocused();
    await expect(tooltips(page)).toHaveText('Edit');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Duplicate' })).toBeFocused();
    await expect(tooltips(page)).toHaveText('Duplicate');
    await expect(tooltips(page)).toHaveCount(1);
    await page.keyboard.press('Shift+Tab');
    await expect(tooltips(page)).toHaveText('Edit');
    await page.keyboard.press('Shift+Tab');
    await expect(tooltips(page)).toHaveCount(0);
  });

  test('a trigger with autoFocus does not open it; Shift+Tab then Tab does', async ({ page }) => {
    await gotoStory(page, STORY('auto-focus'));
    const trigger = page.getByRole('button', { name: 'With autofocus' });
    await expect(trigger).toBeFocused();
    await page.waitForTimeout(SETTLE);
    await expect(tooltips(page)).toHaveCount(0);
    await expect(trigger).not.toHaveAttribute('aria-describedby');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();
    await expect(tooltips(page)).toHaveCount(1);
  });

  test('a panel opened with ArrowDown that autofocuses a trigger does not open it; Shift+Tab then Tab does', async ({
    page,
  }) => {
    await gotoStory(page, STORY('opened-by-arrow-down'));
    await page.getByRole('button', { name: 'Menu' }).focus();
    await page.keyboard.press('ArrowDown');
    const item = page.getByRole('button', { name: 'First item' });
    await expect(item).toBeFocused();
    await page.waitForTimeout(SETTLE);
    await expect(tooltips(page)).toHaveCount(0);
    // A real move onto it does open it: Shift+Tab away and Tab back.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(item).toBeFocused();
    await expect(tooltips(page)).toHaveText('Item detail');
  });

  test('content that changes while it is open: the text follows and it stays centred on the trigger', async ({ page }) => {
    await gotoStory(page, STORY('content-changes-while-open'));
    const trigger = page.getByRole('button', { name: 'Press + or -' });
    // The play function tabbed to the button, pressed "+" and blurred it: the page is in the "long
    // text" state and the sequential-focus starting point is after the button, so the first Tab may
    // leave the page and a second one comes back.
    for (let i = 0; i < 3 && !(await trigger.evaluate((el) => el === document.activeElement)); i += 1) {
      await page.keyboard.press('Tab');
    }
    await expect(trigger).toBeFocused();
    const tooltip = tooltips(page);
    await expect(tooltip).toBeVisible();
    await page.keyboard.press('Minus');
    await expect(tooltip).toHaveText('Short');
    const narrow = (await tooltip.boundingBox())!;
    await page.keyboard.press('Shift+Equal'); // the "+" key
    await expect(tooltip).toHaveText(/A much longer text/);
    await expect
      .poll(async () => {
        const box = (await tooltip.boundingBox())!;
        const anchor = (await trigger.boundingBox())!;
        return {
          wider: box.width > narrow.width + 40,
          centred: Math.abs(box.x + box.width / 2 - (anchor.x + anchor.width / 2)) < 2,
          inside: box.x >= 0,
        };
      })
      .toEqual({ wider: true, centred: true, inside: true });
  });

  test('a programmatic focus() after Enter on another control does not open it', async ({ page }) => {
    await gotoStory(page, STORY('auto-focus'));
    // An app control that moves the focus to the tooltip trigger on click (Enter): script focus
    // right after a key that is not a navigation key.
    await page.evaluate(() => {
      const opener = document.createElement('button');
      opener.textContent = 'Sposta';
      opener.addEventListener('click', () =>
        Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'With autofocus')?.focus(),
      );
      document.body.prepend(opener);
      (document.activeElement as HTMLElement | null)?.blur();
      opener.focus();
    });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(SETTLE);
    await expect(tooltips(page)).toHaveCount(0);
  });
});

test.describe('inside a Dialog', () => {
  test('the focus moved to the trigger by the dialog opens nothing; Shift+Tab then Tab does', async ({ page }) => {
    await gotoStory(page, STORY('inside-dialog-manual'));
    await page.getByRole('button', { name: 'Open' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete row' });
    const trigger = dialog.getByRole('button', { name: 'Delete row' });
    await expect(trigger).toBeFocused();
    await page.waitForTimeout(SETTLE);
    await expect(tooltips(page)).toHaveCount(0);
    await expect(trigger).not.toHaveAttribute('aria-describedby');

    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();
    await expect(tooltips(page)).toHaveCount(1);
  });

  test('also when the dialog is opened with the keyboard (Enter on its trigger)', async ({ page }) => {
    await gotoStory(page, STORY('inside-dialog-manual'));
    await page.getByRole('button', { name: 'Open' }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Delete row' });
    await expect(dialog.getByRole('button', { name: 'Delete row' })).toBeFocused();
    await page.waitForTimeout(SETTLE);
    await expect(tooltips(page)).toHaveCount(0);
  });

  test('Escape closes only the tooltip; a second Escape closes the dialog', async ({ page }) => {
    await gotoStory(page, STORY('inside-dialog-manual'));
    await page.getByRole('button', { name: 'Open' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete row' });
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(tooltips(page)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(tooltips(page)).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('the tooltip is on the tooltip level: content and positioning wrapper, topmost at its centre', async ({ page }) => {
    await gotoStory(page, STORY('inside-dialog-manual'));
    await page.getByRole('button', { name: 'Open' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete row' }).hover();
    const tooltip = tooltips(page);
    await expect(tooltip).toBeVisible();
    const info = await tooltip.evaluate((el) => {
      const token = getComputedStyle(document.documentElement).getPropertyValue('--z-index-rop-tooltip').trim();
      const wrapper = el.parentElement!;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        token,
        content: getComputedStyle(el).zIndex,
        wrapper: getComputedStyle(wrapper).zIndex,
        inline: el.style.zIndex,
        hitInTooltip: !!hit && wrapper.contains(hit),
      };
    });
    expect(info.token).not.toBe('');
    expect(info.content).toBe(info.token);
    expect(info.wrapper).toBe(info.token);
    expect(info.inline).toBe('');
    expect(info.hitInTooltip).toBe(true);
  });

  test('axe: no violations with the tooltip open', async ({ page }) => {
    await gotoStory(page, STORY('inside-dialog-manual'));
    await page.getByRole('button', { name: 'Open' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete row' }).hover();
    await expect(tooltips(page)).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test.describe('disabled trigger and empty content', () => {
  test('a disabled trigger has no tooltip by default; with disabledTriggerFocusable it opens on hover and on Tab', async ({ page }) => {
    await gotoStory(page, STORY('disabled-trigger'));
    const [plain, withReason] = [
      page.getByRole('button', { name: 'Disabled', exact: true }),
      page.getByRole('button', { name: 'Disabled with reason' }),
    ];
    await plain.hover({ force: true });
    await page.waitForTimeout(300);
    await expect(tooltips(page)).toHaveCount(0);

    await withReason.hover({ force: true });
    await expect(tooltips(page)).toHaveText('Missing edit permission');
    await page.mouse.move(700, 700, { steps: 8 });
    await expect(tooltips(page)).toHaveCount(0);

    // The only tab stop is the span around the second button: the plain disabled one is skipped.
    // (The play function left the sequential-focus starting point on that span, so the first Tab
    // may leave the page; a second one comes back to it.)
    const span = withReason.locator('xpath=..');
    for (let i = 0; i < 3 && !(await span.evaluate((el) => el === document.activeElement)); i += 1) {
      await page.keyboard.press('Tab');
    }
    await expect(span).toBeFocused();
    await expect(tooltips(page)).toHaveText('Missing edit permission');
  });

  test('empty content: no tooltip, no aria-describedby, not even on keyboard focus', async ({ page }) => {
    await gotoStory(page, STORY('empty-content'));
    const trigger = page.getByRole('button', { name: 'No text' });
    await trigger.hover();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await expect(tooltips(page)).toHaveCount(0);
    expect(await trigger.getAttribute('aria-describedby')).toBeNull();
  });
});

test.describe('viewport edges and wrapping', () => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 375, height: 667 },
  ]) {
    test(`trigger flush with the right edge (${viewport.width}px): the tooltip stays inside the window`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await gotoStory(page, STORY('viewport-edge'));
      await page.getByRole('button', { name: 'Edge' }).hover();
      const tooltip = tooltips(page);
      await expect(tooltip).toBeVisible();
      await expect.poll(async () => {
        const b = (await tooltip.boundingBox())!;
        return b.x >= 0 && b.x + b.width <= viewport.width;
      }).toBe(true);
    });
  }

  test('long text wraps inside a real maximum width (20rem)', async ({ page }) => {
    await gotoStory(page, STORY('long-text'));
    await page.getByRole('button', { name: 'Detail' }).hover();
    const tooltip = tooltips(page);
    await expect(tooltip).toBeVisible();
    const box = (await tooltip.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(320 + 1);
    expect(box.height).toBeGreaterThan(60);
    // 19rem of content plus 1rem of padding: boxes are content-box in this library.
    expect(await tooltip.evaluate((el) => getComputedStyle(el).maxWidth)).toBe('304px');
    await expectNoA11yViolations(page);
  });

  test('a trigger in an overflow:hidden container and in a Sheet: the tooltip is not clipped and is on top', async ({ page }) => {
    await gotoStory(page, STORY('clipped-and-in-sheet'));
    await page.getByRole('button', { name: 'In the container' }).hover();
    const clipped = tooltips(page);
    await expect(clipped).toBeVisible();
    const box = (await clipped.boundingBox())!;
    // The container is 80px wide: the tooltip starts beyond its right edge and is fully visible.
    expect(await clipped.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && el.parentElement!.contains(hit);
    })).toBe(true);
    expect(box.width).toBeGreaterThan(80);
    await page.mouse.move(700, 700, { steps: 8 });
    await expect(tooltips(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Open sheet' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'In the sheet' }).hover();
    const inSheet = tooltips(page);
    await expect(inSheet).toHaveText('Above the sheet');
    expect(await inSheet.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && el.parentElement!.contains(hit);
    })).toBe(true);
  });
});

test.describe('page scroll', () => {
  test('scrolling the page with the tooltip open closes it (declared behaviour)', async ({ page }) => {
    await gotoStory(page, STORY('playground'), 'delayDuration:0');
    await page.evaluate(() => (document.body.style.minHeight = '3000px'));
    await page.getByRole('button', { name: 'Delete row' }).hover();
    await expect(tooltips(page)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 200));
    await expect(tooltips(page)).toHaveCount(0);
  });
});

test.describe('unmount', () => {
  test('a trigger removed while the tooltip is open leaves no orphan in the DOM', async ({ page }) => {
    await gotoStory(page, STORY('playground'), 'delayDuration:0');
    await page.getByRole('button', { name: 'Delete row' }).hover();
    await expect(tooltips(page)).toBeVisible();
    // Storybook re-renders on args change: switching to another story unmounts the tree.
    await page.evaluate(() => {
      const channel = (window as unknown as { __STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void } })
        .__STORYBOOK_ADDONS_CHANNEL__;
      channel.emit('setCurrentStory', { storyId: 'overlays-tooltip--empty-content', viewMode: 'story' });
    });
    await expect(page.getByRole('button', { name: 'No text' })).toBeVisible();
    await expect(tooltips(page)).toHaveCount(0);
    expect(await page.locator('[data-radix-popper-content-wrapper]').count()).toBe(0);
  });
});

test.describe('no leak', () => {
  test('control props never reach the DOM, and nothing is logged', async ({ page }) => {
    const logged: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') logged.push(m.text());
    });
    await gotoStory(page, STORY('playground'), 'delayDuration:0;side:bottom;align:start');
    const trigger = page.getByRole('button', { name: 'Delete row' });
    await trigger.hover();
    const tooltip = tooltips(page);
    await expect(tooltip).toBeVisible();
    for (const node of [trigger, tooltip]) {
      const attrs = (await node.evaluate((el) => el.getAttributeNames())).map((n) => n.toLowerCase());
      for (const forbidden of ['content', 'side', 'align', 'sideoffset', 'delayduration', 'open', 'disabledtriggerfocusable']) {
        expect(attrs).not.toContain(forbidden);
      }
    }
    expect(logged).toEqual([]);
  });
});

// Touch: the `chromium-touch` project (tag `@touch`).
test.describe('touch @touch', () => {
  test('a tap runs the button action and leaves no tooltip open', async ({ page }) => {
    await gotoStory(page, STORY('click-action'));
    const trigger = page.getByRole('button', { name: 'Count' });
    await trigger.tap();
    await expect(page.getByTestId('count')).toHaveText('1');
    await page.waitForTimeout(SETTLE);
    await expect(tooltips(page)).toHaveCount(0);
    await expect(trigger).not.toHaveAttribute('aria-describedby');
    await trigger.tap();
    await expect(page.getByTestId('count')).toHaveText('2');
    await page.waitForTimeout(300);
    await expect(tooltips(page)).toHaveCount(0);
  });
});
