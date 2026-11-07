import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { expectPlayToPass } from '../helpers/story';

// One test per story tagged `visual` in Storybook's index.json, generated at load time:
// nothing is listed by hand and an untagged story is never photographed.
//
// Per-story options (as additional tags):
//   visual-viewport-only  capture only the viewport instead of the full scrollable page.
// By default the screenshot is of the FULL PAGE (so tall components, e.g. an Object Page, are
// photographed below the fold too), not just #storybook-root, so portals (Dialog, Popover,
// Select...) rendered on document.body are part of the picture.

interface IndexEntry {
  id: string;
  type?: string;
  tags?: string[];
}

// The index is read from the built Storybook on disk (no server, no port, no network wait at
// load time): `playwright test --list`, UI mode and IDE integrations stay instantaneous. The
// webServer in playwright.config.ts builds `storybook-static/` before the tests are loaded.
const INDEX_PATH = fileURLToPath(new URL('../../storybook-static/index.json', import.meta.url));

function loadIndex(): Record<string, IndexEntry> {
  try {
    return (JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as { entries?: Record<string, IndexEntry> }).entries ?? {};
  } catch (e) {
    throw new Error(
      `visual: cannot read ${INDEX_PATH} (${String(e)}). Run "npm run build-storybook" first.`,
    );
  }
}

const visualStories = Object.values(loadIndex()).filter(
  // Autodocs entries inherit the `visual` tag of their stories, but are not photographed: a Docs page opts in
  // explicitly with `visual-docs` (the Introduction).
  (e) => (e.type === 'docs' ? e.tags?.includes('visual-docs') : e.tags?.includes('visual')),
);

if (visualStories.length === 0) {
  throw new Error('visual: no story is tagged "visual" in index.json (the gate would pass vacuously)');
}

for (const story of visualStories) {
  test(`visual: ${story.id}`, async ({ page }, testInfo) => {
    // Baselines are only valid if produced inside the pinned Docker image (scripts/visual-docker.mjs
    // sets VISUAL_DOCKER=1). Refuse to write any from the host browser, however it was invoked.
    if (testInfo.config.updateSnapshots !== 'none' && !process.env.VISUAL_DOCKER) {
      throw new Error(
        'visual: refusing to update baselines outside the pinned Docker image (VISUAL_DOCKER is not set). ' +
          'Run "npm run test:visual:update" instead; nothing was written.',
      );
    }
    // Waits for the story's play function: a story whose picture needs an interaction (a tooltip
    // opened by a simulated hover) is photographed after it, not while it is still running. It
    // also throws on render errors, so we never photograph Storybook's error page.
    if (story.type === 'docs') {
      // A Docs/MDX page (the Introduction): no play function; open the docs view and wait for the live
      // demos to be on the page before photographing it.
      await page.goto(`/iframe.html?id=${story.id}&viewMode=docs`);
      await page.waitForSelector('[data-testid="demo-frame-list-report"] table');
      await page.waitForSelector('[data-testid="demo-frame-field-states"] input');
    } else {
      await expectPlayToPass(page, story.id);
    }
    await page.addStyleTag({
      content: `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }`,
    });
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${story.id}.png`, {
      fullPage: !story.tags?.includes('visual-viewport-only'),
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    });
  });
}
