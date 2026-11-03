import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

const OVERVIEW = 'primitives-avatar--overview';
const PLAYGROUND = 'primitives-avatar--playground';
const BROKEN_URL = '**/__avatar-missing-image__.png';
const SIZES = { xs: 24, sm: 32, md: 40, lg: 48, xl: 64 } as const;
const PHOTO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="192"><rect width="96" height="192" fill="#0a6ed1"/></svg>';

const avatar = (page: Page) => page.getByTestId('avatar');
const size = (page: Page) => avatar(page).evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));

/** Serves the demo's "broken" URL as a real image after `delayMs` (null: let it 404). */
async function serveImage(page: Page, delayMs: number | null) {
  if (delayMs === null) return;
  await page.route(BROKEN_URL, async (route) => {
    await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: PHOTO_SVG });
  });
}

test.describe('Primitives/Avatar', () => {
  test('the play functions pass and the matrix is accessible', async ({ page }) => {
    await expectPlayToPass(page, 'primitives-avatar--breaking-image');
    await expectPlayToPass(page, OVERVIEW);
    await expectNoA11yViolations(page);
  });

  test('the box has the same size with no src, while loading, once loaded and after an error', async ({ page }) => {
    // none
    await gotoStory(page, PLAYGROUND, 'source:none');
    await expect(avatar(page)).toHaveAttribute('data-rop-avatar-status', 'idle');
    const none = await size(page);
    expect(none).toEqual({ w: 40, h: 40 });

    // loading (image served late) then loaded
    await serveImage(page, 1200);
    await gotoStory(page, PLAYGROUND, 'source:broken');
    await expect(avatar(page)).toHaveAttribute('data-rop-avatar-status', 'loading');
    await expect(avatar(page)).toHaveText('AL');
    const loading = await size(page);
    await expect(avatar(page)).toHaveAttribute('data-rop-avatar-status', 'loaded');
    await expect(avatar(page)).toHaveText('');
    const loaded = await size(page);
    await page.unroute(BROKEN_URL);

    // error (404)
    await gotoStory(page, PLAYGROUND, 'source:broken');
    await expect(avatar(page)).toHaveAttribute('data-rop-avatar-status', 'error');
    await expect(avatar(page)).toHaveText('AL');
    const error = await size(page);

    for (const s of [loading, loaded, error]) {
      expect(Math.abs(s.w - none.w)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(s.h - none.h)).toBeLessThanOrEqual(0.5);
    }
  });

  test('the photo fills the box without distortion (object-fit: cover on a non-square image)', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const m = await page.getByTestId('image-circle-xl').evaluate((el) => {
      const img = el.querySelector('img') as HTMLImageElement;
      const a = el.getBoundingClientRect();
      const b = img.getBoundingClientRect();
      return { fit: getComputedStyle(img).objectFit, dw: Math.abs(a.width - b.width), dh: Math.abs(a.height - b.height), natural: img.naturalWidth / img.naturalHeight };
    });
    expect(m.fit).toBe('cover');
    expect(m.dw).toBeLessThanOrEqual(0.5);
    expect(m.dh).toBeLessThanOrEqual(0.5);
    expect(m.natural).toBeCloseTo(0.5, 2); // the asset is not square: cover crops instead of stretching
  });

  test('a changed src never shows the previous photo: back to the initials until the new image has loaded', async ({ page }) => {
    await gotoStory(page, PLAYGROUND);
    await expect(avatar(page)).toHaveAttribute('data-rop-avatar-status', 'loaded');
    await expect(avatar(page).locator('img')).toHaveCSS('visibility', 'visible');
    await serveImage(page, 1200);
    await page.getByRole('button', { name: 'Break the image' }).click();
    // The src is now a late-loading image: until it loads, the old photo must be hidden.
    await expect(avatar(page)).toHaveAttribute('data-rop-avatar-status', 'loading');
    await expect(avatar(page).locator('img')).toHaveCSS('visibility', 'hidden');
    await expect(avatar(page)).toHaveText('AL');
    // ... and a src that was failing but now answers (consumer retry) ends up displayed.
    await expect(avatar(page)).toHaveAttribute('data-rop-avatar-status', 'loaded');
    await expect(avatar(page).locator('img')).toHaveCSS('visibility', 'visible');
  });

  test('sizes are exact and the initials are centred in the box (+-1px) for every size and shape', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    for (const shape of ['circle', 'square']) {
      for (const [name, px] of Object.entries(SIZES)) {
        const m = await page.getByTestId(`initials-${shape}-${name}`).evaluate((el) => {
          const box = el.getBoundingClientRect();
          const text = el.querySelector('[data-rop-avatar-initials]') as HTMLElement;
          const range = document.createRange();
          range.selectNodeContents(text);
          const t = range.getBoundingClientRect();
          return {
            w: box.width,
            h: box.height,
            dx: t.left + t.width / 2 - (box.left + box.width / 2),
            dy: t.top + t.height / 2 - (box.top + box.height / 2),
            fontSize: parseFloat(getComputedStyle(text).fontSize),
            radius: getComputedStyle(el).borderTopLeftRadius,
          };
        });
        expect([m.w, m.h]).toEqual([px, px]);
        expect(Math.abs(m.dx)).toBeLessThanOrEqual(1);
        expect(Math.abs(m.dy)).toBeLessThanOrEqual(1);
        expect(m.fontSize).toBeLessThan(px);
        if (shape === 'square') expect(m.radius).toBe('8px');
        else expect(parseFloat(m.radius)).toBeGreaterThanOrEqual(px / 2);
      }
    }
  });

  test('the initials text grows with the size', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const sizes = await page.evaluate(() =>
      ['xs', 'sm', 'md', 'lg', 'xl'].map((s) =>
        parseFloat(getComputedStyle(document.querySelector(`[data-testid="initials-circle-${s}"] [data-rop-avatar-initials]`) as Element).fontSize),
      ),
    );
    for (let i = 1; i < sizes.length; i += 1) expect(sizes[i]!).toBeGreaterThanOrEqual(sizes[i - 1]!);
    expect(sizes[4]!).toBeGreaterThan(sizes[0]!);
  });

  test('the accessible name is announced once; decorative and nameless avatars are out of the accessibility tree', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    await expect(page.getByRole('img', { name: 'Ada Lovelace' })).toHaveCount(10); // image row, 5 sizes x 2 shapes
    await expect(page.getByTestId('decorative')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByTestId('decorative')).not.toHaveAttribute('aria-label', /.+/);
    await expect(page.getByRole('img', { name: 'Grace Hopper' })).toHaveCount(1);
    expect(await page.getByTestId('image-circle-md').evaluate((el) => el.querySelector('img')?.getAttribute('alt'))).toBe('');
  });

  test('in a container narrower than the avatar it keeps its size (flex-shrink: 0)', async ({ page }) => {
    await gotoStory(page, OVERVIEW);
    const w = await page.getByTestId('narrow-avatar').evaluate((el) => el.getBoundingClientRect().width);
    expect(w).toBe(40);
  });

  test('forced-colors: the box keeps a visible contour', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await gotoStory(page, OVERVIEW);
    const o = await page.getByTestId('icon-circle-md').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor };
    });
    expect(o.style).toBe('solid');
    expect(o.width).toBe('1px');
    expect(o.color).not.toBe('rgba(0, 0, 0, 0)');
  });
});
