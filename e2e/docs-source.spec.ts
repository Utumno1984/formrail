import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// "Show code" must print the story's real source (ticket #333). With Storybook's default `dynamic`
// source, a story whose `render` declares a local stateful component (`function XyzDemo() {...}`) yields
// a useless placeholder such as `<t />`; `parameters.docs.source.type: 'code'` (.storybook/preview.ts)
// shows the original source text instead.

interface IndexEntry {
  id: string;
  type?: string;
  importPath?: string;
}

// What the dynamic JSX synthesis printed for the broken stories: a lone, minified, prop-less element.
const PLACEHOLDER = /^\s*<[A-Za-z]{1,2}\s*\/>\s*$/;

test.describe('Storybook "Show code"', () => {
  test('no Docs page of a story file with a local stateful component shows a placeholder', async ({ page, request }) => {
    test.setTimeout(300_000);
    const res = await request.get('/index.json');
    const index = (await res.json()) as { entries: Record<string, IndexEntry> };
    // The affected stories are found the way the ticket does: stories files declaring `function XyzHost(` /
    // `function XyzDemo(`. Opening every "Show code" of every Docs page (~100) would take ~9 minutes.
    const affected = new Set(
      readdirSync('packages', { recursive: true, encoding: 'utf8' })
        .filter((file) => file.endsWith('.stories.tsx') && !file.includes('node_modules') && /function [A-Za-z]+(Host|Demo)\(/.test(readFileSync(`packages/${file}`, 'utf8')))
        .map((file) => `./packages/${file}`),
    );
    const docs = Object.values(index.entries).filter((e) => e.type === 'docs' && e.importPath && affected.has(e.importPath));
    expect(docs.length, 'the ~27 story files of ticket #333').toBeGreaterThan(20);

    for (const entry of docs) {
      await page.goto(`/iframe.html?id=${entry.id}&viewMode=docs`);
      await page.waitForSelector('.sbdocs-content', { timeout: 15_000 });
      const buttons = page.getByRole('switch', { name: 'Show code' });
      // The source panels mount a little after the page (later on a slow machine): wait, do not read once.
      await expect(buttons.first(), `${entry.id}: no "Show code"`).toBeVisible({ timeout: 15_000 });
      const count = await buttons.count();
      // Opening a panel renames its switch to "Hide code": the next closed one is always the first.
      for (let i = 0; i < count; i++) await buttons.first().click();
      // The highlighter fills the blocks a moment after they open: poll until none is empty.
      // (An MDX page, e.g. Theming, can hold prose code blocks of its own, so the count is not compared.)
      const blocks = page.locator('.sbdocs-content pre');
      await expect(blocks.first(), `${entry.id}: no source block after "Show code"`).toBeVisible();
      for (const code of await blocks.all()) await expect(code, `${entry.id}: empty source`).not.toHaveText('');
      for (const code of await blocks.allInnerTexts()) {
        expect(PLACEHOLDER.test(code), `${entry.id}: placeholder instead of source: ${code.trim()}`).toBe(false);
        // The placeholder pattern is a known symptom, not the contract: any one-liner this short is not a story's source.
        expect(code.trim().length, `${entry.id}: suspiciously short source: ${code.trim()}`).toBeGreaterThan(30);
      }
    }
  });

  // Criterion 3 of the ticket: stories that were fine stay as they were (the live JSX, not the story object).
  test.describe('stories without a local component keep the synthesized JSX', () => {
    const cases = [
      // `export const Playground: Story = {}`: the live props (the production build minifies the tag name, so it is not asserted).
      { docs: 'primitives-avatar--docs', story: 'Playground', needle: 'name="Ada Lovelace"' },
      { docs: 'forms-checkbox--docs', story: 'In Form', needle: '<form' }, // render with a direct JSX return
    ];
    for (const { docs, story, needle } of cases) {
      test(`${docs} → ${story}`, async ({ page }) => {
        await page.goto(`/iframe.html?id=${docs}&viewMode=docs`);
        const heading = `//h3[normalize-space()="${story}"]`;
        await page.locator(`xpath=${heading}/following::*[@role="switch"][1]`).click();
        const block = page.locator(`xpath=${heading}/following::pre[1]`);
        await expect(block).toContainText(needle);
        await expect(block).not.toContainText('render:');
      });
    }
  });

  test.describe('stories that declare a local stateful component in `render`', () => {
    const cases = [
      { docs: 'forms-checkbox--docs', story: 'Select All', needle: 'function SelectAllDemo' },
      { docs: 'forms-combobox--docs', story: 'Async Load', needle: 'function Host' },
    ];
    for (const { docs, story, needle } of cases) {
      test(`${docs} → ${story} prints the real source`, async ({ page }) => {
        await page.goto(`/iframe.html?id=${docs}&viewMode=docs`);
        // The story's own "Show code" switch and source block are the first ones after its heading.
        const heading = `//h3[normalize-space()="${story}"]`;
        await page.locator(`xpath=${heading}/following::*[@role="switch"][1]`).click();
        const block = page.locator(`xpath=${heading}/following::pre[1]`);
        await expect(block).toContainText(needle);
        await expect(block).toContainText('useState');
      });
    }
  });
});
