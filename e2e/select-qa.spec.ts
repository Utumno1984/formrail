import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `forms-select--${name}`;
const combobox = (page: Page): Locator => page.locator('[role="combobox"]');
const listbox = (page: Page): Locator => page.getByRole('listbox');

async function recordActions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __actions: unknown[];
      __STORYBOOK_ADDONS_CHANNEL__?: { on: (e: string, cb: (p: unknown) => void) => void };
    };
    w.__actions = [];
    const timer = setInterval(() => {
      if (!w.__STORYBOOK_ADDONS_CHANNEL__) return;
      clearInterval(timer);
      w.__STORYBOOK_ADDONS_CHANNEL__.on('storybook/actions/action-event', (p) => w.__actions.push(p));
    }, 1);
  });
}
const actions = (page: Page) => page.evaluate(() => (window as unknown as { __actions: unknown[] }).__actions.length);

test.describe('select QA', () => {
  test('trigger: combobox named Paese, describedby = help; with-error describedby has the error', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const t = page.getByRole('combobox', { name: 'Paese' });
    await expect(t).toHaveAttribute('aria-expanded', 'false');
    await expect(t).toHaveAccessibleDescription('Sede legale del fornitore');
    await t.click();
    await expect(page.locator('[role="combobox"]')).toHaveAttribute('aria-expanded', 'true');
    await gotoStory(page, STORY('with-error'));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('combobox', { name: /Paese/ })).toHaveAccessibleDescription(/Seleziona un paese/);
    await expect(page.getByRole('combobox', { name: /Paese/ })).toHaveAttribute('aria-invalid', 'true');
  });

  test('no DOM leak, className wins is covered by unit; trigger attributes are all valid HTML', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const attrs = await combobox(page).evaluate((el) => el.getAttributeNames());
    console.log('trigger attrs:', attrs.join(','));
    for (const a of attrs) expect(a, `suspicious attribute ${a}`).not.toMatch(/interaction|blocked|controlled|unknown|empty/i);
  });

  test('double click on an option calls onValueChange once', async ({ page }) => {
    await recordActions(page);
    await gotoStory(page, STORY('manual'));
    await combobox(page).click();
    await page.getByRole('option', { name: 'Francia' }).dblclick();
    await expect(combobox(page)).toHaveText('Francia');
    await page.waitForTimeout(300);
    expect(await actions(page)).toBe(1);
    await expect(listbox(page)).toHaveCount(0);
  });

  test('focus returns to the trigger on Escape and on pick; second click on the trigger toggles', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const t = combobox(page);
    await t.click();
    await expect(listbox(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(t).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(t).toBeFocused();
    await expect(t).toHaveText('Italia');
  });

  test('Tab with the list open does not leave the list stuck', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const t = combobox(page);
    await t.focus();
    await page.keyboard.press('Enter');
    await expect(listbox(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    const open = await listbox(page).count();
    const active = await page.evaluate(() => document.activeElement?.tagName + ':' + document.activeElement?.getAttribute('role'));
    // Radix traps Tab inside the list: it stays open and the focus does not fall to the page.
    expect(open).toBe(1);
    expect(active).not.toBe('BODY:null');
    expect(await listbox(page).evaluate((el) => el.contains(document.activeElement))).toBe(true);
    // The page must stay usable: pressing Escape closes anything left.
    await page.keyboard.press('Escape');
    await expect(listbox(page)).toHaveCount(0);
  });

  test('typeahead on the closed trigger picks (user gesture) and is reported once', async ({ page }) => {
    await recordActions(page);
    await gotoStory(page, STORY('manual'));
    await combobox(page).focus();
    await page.keyboard.type('sp');
    await expect(combobox(page)).toHaveText('Spagna');
    await expect(listbox(page)).toHaveCount(0);
    await page.keyboard.type('ge'); // disabled Germania: must not be picked
    await page.waitForTimeout(1200);
    await page.keyboard.type('ge');
    await expect(combobox(page)).not.toHaveText('Germania');
  });

  test('keyboard pick inside the Dialog keeps the dialog open and returns focus to the trigger', async ({ page }) => {
    await expectPlayToPass(page, STORY('inside-dialog')); // list open
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(listbox(page)).toHaveCount(0);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(combobox(page)).toBeFocused();
    await expect(combobox(page)).not.toHaveText('Seleziona');
    // Click outside the list but inside the dialog closes the list only.
    await combobox(page).click();
    const h = (await page.locator('[role="dialog"] h2').boundingBox())!;
    await page.mouse.click(h.x + 5, h.y + h.height / 2);
    await expect(listbox(page)).toHaveCount(0);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('forced: mouse down, typeahead and focus do not open; touch-less checks of aria-expanded', async ({ page }) => {
    await gotoStory(page, STORY('forced'));
    const t = combobox(page);
    await t.focus();
    await page.mouse.move(0, 0);
    const box = (await t.boundingBox())!;
    await page.mouse.click(box.x + 10, box.y + 10);
    await page.mouse.dblclick(box.x + 10, box.y + 10);
    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
    await expect(listbox(page)).toHaveCount(0);
    await expect(t).toHaveAttribute('aria-expanded', 'false');
  });

  for (const vp of [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
  ]) {
    for (const story of ['long-list', 'long-labels', 'inside-dialog']) {
      test(`${vp.name}: ${story} list stays in the viewport and options are hit-testable`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await expectPlayToPass(page, STORY(story));
        const box = (await listbox(page).boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
        expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
        const bad = await page.getByRole('option').evaluateAll((els) =>
          els
            .map((el) => {
              const r = el.getBoundingClientRect();
              const vpRect = document.querySelector('[data-radix-select-viewport]')?.getBoundingClientRect();
              if (vpRect && (r.top < vpRect.top || r.bottom > vpRect.bottom)) return null; // scrolled out of the list
              if (r.bottom < 0 || r.top > innerHeight) return null;
              const top = document.elementFromPoint(r.left + r.width / 2, Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1));
              return top && el.contains(top) ? null : el.textContent;
            })
            .filter(Boolean),
        );
        expect(bad).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      });
    }
  }

  test('long list: keyboard End/Home reach the extremes and the list scrolls to them', async ({ page }) => {
    await expectPlayToPass(page, STORY('long-list'));
    await page.keyboard.press('End');
    await expect(page.getByRole('option', { name: 'Cliente 200' })).toBeFocused();
    await expect(page.getByRole('option', { name: 'Cliente 200' })).toBeInViewport();
    await page.keyboard.press('Home');
    await expect(page.getByRole('option', { name: 'Cliente 001' })).toBeFocused();
    await expect(page.getByRole('option', { name: 'Cliente 001' })).toBeInViewport();
  });

  test('async-load: re-opening after load shows the selection, and picking then reports once', async ({ page }) => {
    await recordActions(page);
    await expectPlayToPass(page, STORY('async-load'));
    expect(await actions(page)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(listbox(page)).toHaveCount(0);
    expect(await actions(page)).toBe(0);
    await combobox(page).click();
    await expect(page.getByRole('option', { name: 'Spagna' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('option', { name: 'Francia' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => actions(page)).toBe(1);
    // Picking the already-selected option reports nothing.
    await combobox(page).click();
    await expect(page.getByRole('option', { name: 'Francia' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(listbox(page)).toHaveCount(0);
    expect(await actions(page)).toBe(1);
  });
});

test.describe('select QA race', () => {
  test('ArrowDown then immediate typeahead + Enter (burst) ends on Francia', async ({ page }) => {
    // 25 sequential gotoStory() page loads take 23-31s, which exceeds the default 30s
    // test timeout. The iteration count is the point of the race test, so raise the budget.
    test.setTimeout(90_000);
    const results: Record<string, number> = {};
    for (let i = 0; i < 25; i += 1) {
      await gotoStory(page, STORY('manual'));
      const t = combobox(page);
      await t.focus();
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(60); // human-ish latency
      await page.keyboard.type('fr');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(150);
      const key = `${(await t.textContent()) ?? ''}|open=${await listbox(page).count()}`;
      results[key] = (results[key] ?? 0) + 1;
    }
    expect(results).toEqual({ 'Francia|open=0': 25 });
  });
});

test.describe('select QA touch @touch', () => {
  test('forced and disabled never open on tap; default opens on tap and a tap on an option picks @touch', async ({ page }) => {
    await gotoStory(page, STORY('forced'));
    await combobox(page).tap();
    await expect(listbox(page)).toHaveCount(0);
    await gotoStory(page, STORY('disabled'));
    await combobox(page).tap({ force: true });
    await expect(listbox(page)).toHaveCount(0);
    await gotoStory(page, STORY('manual'));
    await combobox(page).tap();
    await expect(listbox(page)).toBeVisible();
    await page.getByRole('option', { name: 'Austria' }).tap();
    await expect(combobox(page)).toHaveText('Austria');
    await expect(listbox(page)).toHaveCount(0);
  });
});
