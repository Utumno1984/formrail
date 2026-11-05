import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow, expectSingleScroller } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `floorplans-object-page-anchor-bar--${name}`;
const SCROLLER = '[data-object-page-scroller]';
const BAR = 'nav[aria-label]';

const scrollTopOf = (page: Page) => page.locator(SCROLLER).evaluate((el) => el.scrollTop);
const activeNames = (page: Page) =>
  page.locator(`${BAR} a[aria-current]`).evaluateAll((links) => links.map((a) => a.textContent));
/** Waits until the scroller stops moving (smooth scroll finished). */
const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const el = document.querySelector('[data-object-page-scroller]') as HTMLElement;
        let last = -1;
        let still = 0;
        const tick = () => {
          still = el.scrollTop === last ? still + 1 : 0;
          last = el.scrollTop;
          if (still >= 5) resolve();
          else requestAnimationFrame(tick);
        };
        tick();
      }),
  );

test.describe('Floorplans/Object Page/Anchor Bar', () => {
  test('a nav of real links in DOM order; none with one section or sectionNavigation=none', async ({ page }) => {
    await gotoStory(page, STORY('scrollable'), 'sectionCount:4');
    const nav = page.getByRole('navigation', { name: 'Sections' });
    await expect(nav.getByRole('link')).toHaveText(['Dati generali', 'Fornitore', 'Righe', 'Importi']);
    await expect(nav.getByRole('link').first()).toHaveAttribute('href', '#sezione-1');

    await gotoStory(page, STORY('scrollable'), 'sectionCount:1');
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await gotoStory(page, STORY('scrollable'), 'sectionNavigation:none');
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await gotoStory(page, STORY('scrollable'), 'anchorBarLabel:Vai a');
    await expect(page.getByRole('navigation', { name: 'Vai a' })).toBeVisible();
  });

  test('the bar is sticky at the top of the scroller and publishes its height as the sticky offset', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, STORY('scrollable'));
    const bar = page.locator(BAR);
    const scroller = page.locator(SCROLLER);
    const top0 = (await bar.boundingBox())!.y;
    await scroller.evaluate((el) => (el.scrollTop = 700));
    const box = (await bar.boundingBox())!;
    expect(Math.abs(box.y - top0)).toBeLessThanOrEqual(1);
    const offset = await scroller.evaluate((el) => getComputedStyle(el).getPropertyValue('--rop-object-page-sticky-offset'));
    expect(parseFloat(offset)).toBeCloseTo(box.height, 0);
    await expectSingleScroller(page.locator('#storybook-root'));
  });

  test('a click scrolls the inner scroller below the bar, keeps the URL and moves the focus to the title', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, STORY('scrollable'));
    const hash = await page.evaluate(() => location.hash);
    const history = await page.evaluate(() => window.history.length);
    await page.getByRole('link', { name: 'Righe' }).click();
    await settle(page);

    const heading = page.getByRole('heading', { name: 'Righe', level: 2 });
    await expect(heading).toBeFocused();
    const barBottom = await page.locator(BAR).evaluate((el) => el.getBoundingClientRect().bottom);
    const headingTop = await heading.evaluate((el) => el.getBoundingClientRect().top);
    const sectionTop = await page.getByRole('region', { name: 'Righe' }).evaluate((el) => el.getBoundingClientRect().top);
    expect(sectionTop).toBeGreaterThanOrEqual(barBottom - 1);
    expect(sectionTop - barBottom).toBeLessThanOrEqual(8);
    expect(headingTop).toBeGreaterThanOrEqual(barBottom - 1);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
    expect(await page.evaluate(() => location.hash)).toBe(hash);
    expect(await page.evaluate(() => window.history.length)).toBe(history);
    expect(await activeNames(page)).toEqual(['Righe']);

    // Clicking the active link again brings the section back to the top and the focus to its title.
    await page.locator(SCROLLER).evaluate((el) => (el.scrollTop += 30));
    await page.getByRole('link', { name: 'Righe' }).click();
    await settle(page);
    await expect(heading).toBeFocused();
    expect((await page.getByRole('region', { name: 'Righe' }).evaluate((el) => el.getBoundingClientRect().top)) - barBottom).toBeLessThanOrEqual(8);
  });

  test('the focus indicator of the target title is not cut by the bar', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoStory(page, STORY('scrollable'));
    await page.getByRole('link', { name: 'Importi' }).focus();
    await page.keyboard.press('Enter');
    const heading = page.getByRole('heading', { name: 'Importi' });
    await expect(heading).toBeFocused();
    const { barBottom, top, left } = await heading.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { barBottom: document.querySelector('nav[aria-label]')!.getBoundingClientRect().bottom, top: r.top, left: r.left };
    });
    // The indicator is drawn 2px away and 2px wide: 4px above the title, which must still be below the bar.
    expect(top - 4).toBeGreaterThanOrEqual(barBottom - 0.5);
    const covered = await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('nav[aria-label]'),
      { x: left + 10, y: top - 3 },
    );
    expect(covered).toBe(false);
  });

  test('clicking or typing in a field of the section jumped to keeps the active link', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 });
    await gotoStory(page, STORY('scrollable'), 'sectionCount:6;lastSectionHeight:40');
    await page.getByRole('link', { name: 'Pagamenti' }).click();
    await settle(page);
    expect(await activeNames(page)).toEqual(['Pagamenti']);
    const field = page.getByRole('textbox', { name: 'Campo Pagamenti' });
    await field.click();
    await page.keyboard.type('a b');
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    expect(await activeNames(page)).toEqual(['Pagamenti']);
  });

  test('the section jumped to grows after arriving (an error message, a longer textarea): the active link stays', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 });
    // The last section is short, so the jump to "Pagamenti" stops short of the top: the scroller is at its end.
    await gotoStory(page, STORY('scrollable'), 'sectionCount:6;lastSectionHeight:40');
    await page.getByRole('link', { name: 'Pagamenti' }).click();
    await settle(page);
    expect(await activeNames(page)).toEqual(['Pagamenti']);
    await page.evaluate(() => {
      const extra = document.createElement('div');
      extra.style.height = '20px';
      document.getElementById('sezione-5')!.appendChild(extra);
    });
    await page.waitForTimeout(400);
    expect(await activeNames(page)).toEqual(['Pagamenti']);
    // Several more growths in a row.
    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(() => {
        const extra = document.createElement('div');
        extra.style.height = '15px';
        document.getElementById('sezione-5')!.appendChild(extra);
      });
      await page.waitForTimeout(100);
    }
    expect(await activeNames(page)).toEqual(['Pagamenti']);
  });

  test('content that grows while the jump is animating: it still lands the section below the bar', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, STORY('scrollable'), 'sectionCount:6');
    await page.getByRole('link', { name: 'Importi' }).click();
    await page.waitForTimeout(60);
    await page.evaluate(() => {
      const filler = document.createElement('div');
      filler.style.height = '900px';
      document.getElementById('sezione-2')!.appendChild(filler);
    });
    await settle(page);
    await page.waitForTimeout(300);
    expect(await activeNames(page)).toEqual(['Importi']);
    const barBottom = await page.locator(BAR).evaluate((el) => el.getBoundingClientRect().bottom);
    const sectionTop = await page.getByRole('region', { name: 'Importi' }).evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(sectionTop - barBottom - 4)).toBeLessThanOrEqual(2);
  });

  test('keyboard only: Enter on a link, then Tab enters the content of the section', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, STORY('scrollable'));
    await page.getByRole('link', { name: 'Pagamenti' }).focus();
    await page.keyboard.press('Enter');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Pagamenti' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Campo Pagamenti' })).toBeFocused();
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  });

  test('scroll-spy: the current section while scrolling by hand; the last one at the end even if short', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, STORY('scrollable'), 'sectionCount:6;lastSectionHeight:60');
    const scroller = page.locator(SCROLLER);
    expect(await activeNames(page)).toEqual(['Dati generali']);

    const barBottom = await page.locator(BAR).evaluate((el) => el.getBoundingClientRect().bottom);
    for (const title of ['Fornitore', 'Righe', 'Importi']) {
      const top = await page.getByRole('region', { name: title }).evaluate((el, edge) => {
        const sc = document.querySelector('[data-object-page-scroller]') as HTMLElement;
        return el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - edge;
      }, barBottom);
      await scroller.evaluate((el, y) => (el.scrollTop = y + 10), top);
      await expect.poll(() => activeNames(page)).toEqual([title]);
      await scroller.evaluate((el, y) => (el.scrollTop = y - 10), top);
      await expect.poll(async () => (await activeNames(page))[0]).not.toBe(title);
    }
    await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect.poll(() => activeNames(page)).toEqual(['Allegati']);
    // The short last section cannot reach the top, yet it is the active one: and only one is.
    expect(await page.getByRole('region', { name: 'Allegati' }).evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThan(barBottom + 20);
    await scroller.evaluate((el) => (el.scrollTop = 0));
    await expect.poll(() => activeNames(page)).toEqual(['Dati generali']);
  });

  test('no flicker: after a click on a far section the active link is the clicked one all along the animation', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, STORY('scrollable'), 'sectionCount:10');
    await page.evaluate(() => {
      const seen = new Set<string>();
      (window as unknown as { __seen: Set<string> }).__seen = seen;
      // Only what is seen after the click counts (before it, the first link is rightly the active one).
      document.addEventListener('click', () => seen.clear(), true);
      const sample = () => {
        for (const a of document.querySelectorAll('nav[aria-label] a[aria-current]')) seen.add(a.textContent ?? '');
        requestAnimationFrame(sample);
      };
      sample();
    });
    await page.getByRole('link', { name: 'Audit' }).click();
    await settle(page);
    expect(await page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen])).toEqual(['Audit']);
    // Once the user scrolls by hand, the spy takes over again.
    await page.locator(SCROLLER).hover();
    await page.mouse.wheel(0, -4000);
    await expect.poll(() => activeNames(page)).not.toEqual(['Audit']);
  });

  test('prefers-reduced-motion: the jump is instant', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoStory(page, STORY('scrollable'), 'sectionCount:10');
    await page.getByRole('link', { name: 'Audit' }).click();
    // No animation: the position at the next frame already is the final one.
    const [first, later] = await page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const el = document.querySelector('[data-object-page-scroller]') as HTMLElement;
          requestAnimationFrame(() => {
            const now = el.scrollTop;
            setTimeout(() => resolve([now, el.scrollTop]), 400);
          });
        }),
    );
    expect(first).toBeGreaterThan(0);
    expect(later).toBe(first);
  });

  test('nothing to scroll: the first is active; clicking the last one activates it without scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await gotoStory(page, STORY('nothing-to-scroll'));
    expect(await activeNames(page)).toEqual(['Uno']);
    await page.getByRole('link', { name: 'Tre' }).click();
    await expect.poll(() => activeNames(page)).toEqual(['Tre']);
    expect(await scrollTopOf(page)).toBe(0);
    await expect(page.getByRole('heading', { name: 'Tre' })).toBeFocused();
  });

  test('at 320px the bar scrolls inside itself, the page does not overflow and the active link is brought into view', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoStory(page, STORY('many-sections'));
    await expectNoHorizontalOverflow(page.locator(SCROLLER));
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth)).toBe(true);
    await expectSingleScroller(page.locator('#storybook-root'));
    const list = page.locator(`${BAR} ul`);
    expect(await list.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    // A long title is cut, not wrapped: every link is one line tall.
    const heights = await page.locator(`${BAR} a`).evaluateAll((links) => links.map((a) => a.getBoundingClientRect().height));
    expect(new Set(heights.map(Math.round)).size).toBe(1);

    await page.locator(SCROLLER).evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect.poll(async () => (await activeNames(page))[0]).toBe('Registro di audit completo');
    await expect.poll(() => list.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    const inView = await page.locator(`${BAR} a[aria-current]`).evaluate((a) => {
      const l = a.closest('ul')!.getBoundingClientRect();
      const r = a.getBoundingClientRect();
      return r.left >= l.left - 1 && r.right <= l.right + 1;
    });
    expect(inView).toBe(true);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  });

  test('at 375px an off-screen active link is centered in the bar, whatever links were active before', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    const target = 'Allegati e documenti collegati';
    const finalState = async (via: string[]) => {
      await gotoStory(page, STORY('many-sections'));
      for (const name of [...via, target]) {
        await page.getByRole('link', { name, exact: true }).click();
        await expect.poll(async () => (await activeNames(page))[0]).toBe(name);
        await settle(page);
      }
      // The link's center aligned with the list's center, up to rounding.
      await expect
        .poll(() =>
          page.locator(`${BAR} a[aria-current]`).evaluate((a) => {
            const l = a.closest('ul')!.getBoundingClientRect();
            const r = a.getBoundingClientRect();
            return Math.abs((r.left + r.right) / 2 - (l.left + l.right) / 2);
          }),
        )
        .toBeLessThanOrEqual(2);
      return page.locator(`${BAR} ul`).evaluate((el) => el.scrollLeft);
    };
    const direct = await finalState([]);
    const viaIntermediate = await finalState(['Fornitore e coordinate bancarie', 'Registro di audit completo']);
    expect(direct).toBeGreaterThan(0);
    expect(Math.abs(viaIntermediate - direct)).toBeLessThanOrEqual(2);
  });

  test('a tooltip opened in a section stays above the bar', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, STORY('tooltip-over-bar'));
    const button = page.getByRole('button', { name: 'Dettagli' });
    const barBottom = await page.locator(BAR).evaluate((el) => el.getBoundingClientRect().bottom);
    // The button right under the bar: its tooltip (above it) overlaps the bar.
    await page.locator(SCROLLER).evaluate((el, edge) => {
      const b = el.querySelector('button') as HTMLElement;
      el.scrollTop += b.getBoundingClientRect().top - el.getBoundingClientRect().top - edge - 4;
    }, barBottom);
    await button.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    const box = (await tooltip.boundingBox())!;
    expect(box.y).toBeLessThan(barBottom);
    const hit = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return !!el?.closest('[data-radix-popper-content-wrapper], [role="tooltip"]');
      },
      { x: box.x + box.width / 2, y: box.y + Math.min(4, box.height / 2) },
    );
    expect(hit).toBe(true);
  });

  test('axe is clean and the story play functions pass', async ({ page }) => {
    await gotoStory(page, STORY('many-sections'));
    await expectNoA11yViolations(page);
    await gotoStory(page, STORY('scrollable'));
    await expectNoA11yViolations(page);
    for (const id of ['playground', 'mid-page', 'many-sections']) {
      await expectPlayToPass(page, STORY(id));
    }
  });
});
