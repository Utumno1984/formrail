import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { colourOf } from './helpers/colour';
import { expectFocusRingVisible } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const OVERVIEW = 'primitives-button--overview';

test.describe('Primitives/Button', () => {
  test('the visual matrix renders every variant x size and passes axe', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    for (const variant of ['primary', 'secondary', 'ghost', 'danger']) {
      for (const size of ['sm', 'md', 'lg']) {
        await expect(page.getByTestId(`matrix-${variant}-${size}`)).toBeVisible();
      }
    }
    await expectNoA11yViolations(page);
  });

  test('size="inline" inside a paragraph does not widen the line', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const heightOf = (id: string) =>
      page.getByTestId(id).evaluate((el) => el.getBoundingClientRect().height);
    const plain = await heightOf('inline-without');
    const withButton = await heightOf('inline-with');
    expect(plain).toBe(20); // text-rop-body line height
    expect(withButton).toBe(plain);
    const button = await page.getByTestId('inline-button').evaluate((el) => el.getBoundingClientRect().height);
    expect(button).toBeLessThanOrEqual(20);
  });

  test('a consumer className="h-12" wins over the size height', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const height = (id: string) => page.getByTestId(id).evaluate((el) => getComputedStyle(el).height);
    expect(await height('override-height')).toBe('48px');
    expect(await height('override-lower')).toBe('32px'); // lower than the md default: still wins
    expect(await height('no-override')).toBe('36px');
  });

  test('keyboard focus shows a visible, unclipped indicator; a mouse click does not', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const target = page.getByTestId('focus-target');
    await expectFocusRingVisible(target);
    await target.blur();
    await target.click();
    expect(await target.evaluate((el) => el.matches(':focus-visible'))).toBe(false);
    expect(await target.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  });

  test('a long label in a narrow sm button wraps and stays inside the button', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const metrics = await page.getByTestId('long-label').evaluate((el) => ({
      width: el.getBoundingClientRect().width,
      overflowX: el.scrollWidth - el.clientWidth,
      height: el.getBoundingClientRect().height,
    }));
    expect(metrics.width).toBeLessThanOrEqual(160);
    expect(metrics.overflowX).toBeLessThanOrEqual(1);
    expect(metrics.height).toBeGreaterThan(32);
  });

  test('disabled buttons and the aria-disabled link are never reached by Tab, and clicking the link goes nowhere', async ({
    page,
  }) => {
    await gotoStory(page, OVERVIEW);
    const disabled = page.locator('#storybook-root').getByText(/disabled$/);
    await expect(disabled).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'primary disabled' })).toBeDisabled();
    await expect(page.getByRole('link', { name: 'Link disabled' })).toHaveAttribute('aria-disabled', 'true');
    const total = await page.locator('#storybook-root').locator('button:not(:disabled), a[href]').count();
    const reached: string[] = [];
    for (let i = 0; i < total + 1; i += 1) {
      await page.keyboard.press('Tab');
      reached.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          const blocked = !!el && (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true');
          return `${blocked ? 'BLOCKED:' : ''}${el?.textContent?.trim().slice(0, 20) ?? ''}`;
        }),
      );
    }
    expect(reached.filter((r) => r.startsWith('BLOCKED:'))).toEqual([]);
    // A click on the disabled link is blocked: the navigation to its href (`#x`) never happens.
    await page.getByRole('link', { name: 'Link disabled' }).click({ force: true }); // (Playwright treats aria-disabled as not actionable)
    expect(new URL(page.url()).hash).toBe('');
  });

  test('hover darkens an enabled button but never a disabled one (button and aria-disabled link)', async ({
    page,
  }) => {
    await gotoStory(page, OVERVIEW);
    const bg = (locator: ReturnType<typeof page.locator>) =>
      locator.evaluate((el) => getComputedStyle(el).backgroundColor);
    for (const target of [
      page.getByRole('button', { name: 'primary disabled' }),
      page.getByRole('link', { name: 'Link disabled' }),
    ]) {
      const before = await bg(target);
      await target.hover({ force: true });
      expect(await bg(target)).toBe(before);
    }
    const enabled = page.getByTestId('matrix-primary-md');
    const rest = await bg(enabled);
    await enabled.hover();
    expect(await bg(enabled)).not.toBe(rest);
  });

  test('the hover color follows an override of --color-rop-primary / --color-rop-error', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    await page.addStyleTag({ content: ':root { --color-rop-primary: #ff0000; --color-rop-error: #0000ff; }' });
    const hovered = async (testId: string) => {
      const target = page.getByTestId(testId);
      await target.hover();
      return colourOf(target, 'backgroundColor');
    };
    expect(await hovered('matrix-primary-md')).toEqual([204, 0, 0]); // 80% of #ff0000 + 20% black
    expect(await hovered('matrix-danger-md')).toEqual([0, 0, 204]);
  });

  test('text sits 1px above the box centre, icons stay on the box centre (real bounding boxes)', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    for (const id of ['matrix-primary-lead', 'matrix-primary-trail', 'matrix-secondary-lead']) {
      const m = await page.getByTestId(id).evaluate((el) => {
        const box = el.getBoundingClientRect();
        const icon = el.querySelector('svg')!.getBoundingClientRect();
        const span = el.querySelector(':scope > span') as HTMLElement;
        const textNode = span.firstChild!;
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const text = range.getBoundingClientRect();
        return {
          boxCenter: box.top + box.height / 2,
          iconCenter: icon.top + icon.height / 2,
          textCenter: text.top + text.height / 2,
          textHeight: text.height,
          lineHeight: getComputedStyle(span).lineHeight,
          fontSize: getComputedStyle(span).fontSize,
        };
      });
      expect(m.fontSize).toBe('14px');
      expect(Math.abs(m.iconCenter - m.boxCenter)).toBeLessThanOrEqual(0.5); // icon: no offset
      expect(Math.abs(m.textCenter - (m.boxCenter - 1))).toBeLessThanOrEqual(0.5); // text: 1px up
      expect(m.textHeight).toBeLessThanOrEqual(m.lineHeight === 'normal' ? 99 : 20);
    }
  });

  test('text-only sm/md/lg keep their heights and the text is 1px above centre', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    for (const [size, height] of [['sm', 32], ['md', 36], ['lg', 44]] as const) {
      const m = await page.getByTestId(`matrix-secondary-${size}`).evaluate((el) => {
        const box = el.getBoundingClientRect();
        const span = el.firstElementChild!;
        const s = getComputedStyle(span);
        const range = document.createRange();
        range.selectNodeContents(span.firstChild!);
        const text = range.getBoundingClientRect();
        return { h: box.height, top: s.top, line: getComputedStyle(el).lineHeight, off: box.top + box.height / 2 - (text.top + text.height / 2) };
      });
      expect(m.h).toBe(height);
      expect(m.top).toBe('-1px');
      expect(m.line).toBe('14px'); // line-height: 1 on a 14px font
      expect(Math.abs(m.off - 1)).toBeLessThanOrEqual(0.5);
    }
  });

  test('size="inline" is unchanged: no label wrapper, font and line height inherited', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const m = await page.getByTestId('inline-button').evaluate((el) => {
      const parent = getComputedStyle(el.parentElement!);
      const s = getComputedStyle(el);
      return {
        spans: el.querySelectorAll('span').length,
        lineHeight: s.lineHeight,
        parentLineHeight: parent.lineHeight,
        fontSize: s.fontSize,
        parentFontSize: parent.fontSize,
        height: el.getBoundingClientRect().height,
      };
    });
    expect(m.spans).toBe(0);
    expect(m.lineHeight).toBe(m.parentLineHeight);
    expect(m.fontSize).toBe(m.parentFontSize);
    expect(m.height).toBe(20);
  });

  test('primary: hover is blue-700 and a pressed mouse is blue-800; a disabled one never changes', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const token = (name: `--${string}`) => colourOf(page, name);
    const bg = (locator: ReturnType<typeof page.locator>) => colourOf(locator, 'backgroundColor');

    const target = page.getByTestId('matrix-primary-md');
    const rest = await bg(target);
    expect(rest).toEqual(await token('--color-rop-blue-600'));
    await target.hover();
    expect(await bg(target)).toEqual(await token('--color-rop-blue-700'));
    await page.mouse.down();
    expect(await bg(target)).toEqual(await token('--color-rop-blue-800'));
    await page.mouse.up();

    const disabled = page.getByRole('button', { name: 'primary disabled' });
    const before = await bg(disabled);
    await disabled.hover({ force: true });
    await page.mouse.down();
    expect(await bg(disabled)).toEqual(before);
    await page.mouse.up();
    const link = page.getByRole('link', { name: 'Link disabled' });
    const linkBefore = await bg(link);
    await link.hover({ force: true });
    await page.mouse.down();
    expect(await bg(link)).toEqual(linkBefore);
    await page.mouse.up();
  });

  test('size="inline" in a container narrower than its label: one line tall, overflows instead of wrapping', async ({
    page,
  }) => {
    await gotoStory(page, 'primitives-button--inline-narrow');
    const m = await page.getByTestId('narrow-inline').evaluate((el) => {
      const container = document.querySelector('[data-testid="narrow"]')!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      // The label is a raw text node (no wrapping span): measure where it actually starts on
      // screen with a Range, instead of trusting box/scrollWidth alone.
      const textNode = Array.from(el.childNodes).find((n) => n.nodeType === Node.TEXT_NODE)!;
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const textBox = range.getBoundingClientRect();
      return {
        height: box.height,
        width: box.width,
        left: box.left,
        textLeft: textBox.left,
        containerWidth: container.width,
        content: el.scrollWidth,
      };
    });
    expect(m.height).toBeLessThanOrEqual(20); // no wrapping: still one line
    expect(m.width).toBeLessThanOrEqual(m.containerWidth); // the button itself is capped (max-w-full)...
    expect(m.content).toBeGreaterThan(m.width); // ...so the label spills out of it: documented trade-off
    // Regression (#35): a centered overflowing label used to spill ~evenly on BOTH sides, pushing
    // its start off-screen to the left (invisible) instead of only overflowing to the right.
    expect(m.textLeft).toBeGreaterThanOrEqual(m.left - 1); // -1px: sub-pixel rounding tolerance
  });

  test('disabled: the play function (Interactions) passes', async ({ page }) => {
    await expectPlayToPass(page, 'primitives-button--disabled');
  });

  test('the play functions of Playground, IconOnly and AsLink really pass; asChild renders no <button>', async ({
    page,
  }) => {
    await expectPlayToPass(page, 'primitives-button--playground');
    await expectNoA11yViolations(page);
    await expectPlayToPass(page, 'primitives-button--icon-only');
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
    await expectNoA11yViolations(page);
    await expectPlayToPass(page, 'primitives-button--as-link');
    await expect(page.locator('#storybook-root button')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Go to details' })).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
