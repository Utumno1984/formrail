import { expect, test } from '@playwright/test';

// Sale on standby (ticket #715, maintainer decision of 2026-11-26, evening): no page of the published site
// loads anything from Paddle or offers a way to pay. To be removed or loosened ONLY in the ticket that
// reopens the sale, on explicit instruction of the maintainer. The unit guard on the assembled HTML is
// scripts/site-no-checkout.test.mjs. Runs against the assembled `site/` (playwright.site.config.ts).

const PAYMENT = /\b(buy|purchase|checkout|pre-?order)\b/i;

test.describe('sale on standby: no checkout on any page', () => {
  test('every public page: no request to Paddle, no payment link or button', async ({ page, request }) => {
    const paths = ['', 'teams/', 'privacy/', 'license/', 'refund/', 'articles/', 'teams/buy/'];
    // the articles really published, if any (none today: /articles/ is then the 404)
    const index = await request.get('articles/');
    if (index.ok()) {
      const slugs = [...(await index.text()).matchAll(/href="[^"]*\/articles\/([^/"]+)\/"/g)].map((m) => m[1]);
      for (const slug of new Set(slugs)) paths.push(`articles/${slug}/`);
    }
    const paddle: string[] = [];
    page.on('request', (req) => {
      if (/paddle/i.test(new URL(req.url()).hostname)) paddle.push(req.url());
    });
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('link', { name: PAYMENT }), `links on ${path}`).toHaveCount(0);
      await expect(page.getByRole('button', { name: PAYMENT }), `buttons on ${path}`).toHaveCount(0);
      const foreignScripts = await page.evaluate(() =>
        [...document.scripts].map((s) => s.src).filter((src) => src && new URL(src).origin !== location.origin),
      );
      expect(foreignScripts, `scripts from other sites on ${path}`).toEqual([]);
    }
    expect(paddle).toEqual([]);
  });

  test('the legal pages still link to Paddle documents, as plain links, without loading anything', async ({ page }) => {
    const paddle: string[] = [];
    page.on('request', (req) => {
      if (/paddle/i.test(new URL(req.url()).hostname)) paddle.push(req.url());
    });
    await page.goto('privacy/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: /Paddle's privacy notice/ }).first()).toHaveAttribute(
      'href',
      'https://www.paddle.com/legal/privacy',
    );
    expect(paddle).toEqual([]);
  });

  test('/teams/buy/ does not exist: the site 404 page', async ({ page }) => {
    for (const url of ['teams/buy/', 'teams/buy']) {
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(404);
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    }
  });
});
