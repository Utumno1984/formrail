import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  BASELINE_FILE,
  auditNeutralDocs,
  findDomainTerms,
  neutralDocsStories,
  type NeutralDocsBaseline,
  type NeutralFinding,
  type NeutralIndexStory,
} from '../packages/core/src/internal/demo-data/neutral-docs-guard';
import { gotoStory } from './helpers/story';

// Ticket #625: the neutral part of every public Docs page (copy-paste example, Playground, "Stories") holds no
// business-domain term; the "Examples"/"Use cases" section (`use-case` stories) is where a domain may appear.
// The rules and their negative tests are in packages/core/src/internal/demo-data/neutral-docs-guard.test.ts; here
// they run on the real build. Pages not migrated yet are in scripts/neutral-docs.baseline.json, a ratchet that
// can only shrink (no command adds to it). Each neutral story is opened alone in its own iframe: its canvas AND
// the portals it opens (Dialog, Sheet, Toast) are the whole body, and a use case of the same page can never leak in.

interface IndexEntry extends NeutralIndexStory {
  type?: string;
  name: string;
}

const baseline = JSON.parse(readFileSync(resolve(fileURLToPath(new URL('..', import.meta.url)), BASELINE_FILE), 'utf8')) as NeutralDocsBaseline;

async function readIndex(request: APIRequestContext) {
  const index = (await (await request.get('/index.json')).json()) as { entries: Record<string, IndexEntry> };
  const entries = Object.values(index.entries);
  const docsTitles = new Set(entries.filter((entry) => entry.type === 'docs').map((entry) => entry.title));
  const stories = entries.filter((entry) => entry.type === 'story');
  return { pages: neutralDocsStories(stories, docsTitles), stories };
}

const SHARDS = 8;

test.describe('Neutral Docs guard', () => {
  test('the baseline lists only public Docs pages of this build, with known terms', async ({ request }) => {
    const { pages } = await readIndex(request);
    expect(pages.size).toBeGreaterThan(10);
    // The Pro pages only exist in the Pro build: an entry for one is read in that build only.
    const missing = Object.keys(baseline.pages).filter((title) => !pages.has(title) && !title.startsWith('Pro/'));
    expect(missing, `${BASELINE_FILE} lists pages that are not public Docs pages: remove them`).toEqual([]);
    for (const [title, terms] of Object.entries(baseline.pages)) {
      expect(terms.length, `${title}: an entry without terms`).toBeGreaterThan(0);
      expect(terms, `${title}: terms sorted and unique`).toEqual([...new Set(terms)].sort());
    }
  });

  for (let shard = 0; shard < SHARDS; shard++) {
    test(`no domain term in the neutral stories (pages ${shard + 1}/${SHARDS})`, async ({ page, request }) => {
      test.setTimeout(600_000);
      const { pages } = await readIndex(request);
      const mine = [...pages].filter(([, stories], i) => stories.length > 0 && i % SHARDS === shard);
      const findings: NeutralFinding[] = [];
      for (const [title, stories] of mine) {
        for (const story of stories) {
          await gotoStory(page, story.id);
          // The whole body: the canvas and the portals, `textContent` so text scrolled out of view or in a
          // fixed-height box counts, plus the attributes a reader hears or sees as a hint.
          const text = await page.evaluate(() => {
            const skip = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);
            const parts: string[] = [];
            const walk = (node: Element) => {
              if (skip.has(node.tagName) || node.id === 'storybook-docs') return;
              for (const attr of ['aria-label', 'aria-description', 'placeholder', 'title', 'alt']) {
                const value = node.getAttribute(attr);
                if (value) parts.push(value);
              }
              for (const child of node.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) parts.push(child.textContent ?? '');
                else if (child.nodeType === Node.ELEMENT_NODE) walk(child as Element);
              }
              parts.push('\n');
            };
            walk(document.body);
            return parts.join(' ');
          });
          for (const found of findDomainTerms(text)) findings.push({ ...found, title, storyId: story.id });
        }
      }
      const scanned = mine.map(([title]) => title);
      const mineBaseline: NeutralDocsBaseline = { version: 1, pages: Object.fromEntries(Object.entries(baseline.pages).filter(([title]) => scanned.includes(title))) };
      expect(auditNeutralDocs(scanned, findings, mineBaseline)).toEqual([]);
    });
  }
});
