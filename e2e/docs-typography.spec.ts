import { expect, test, type Page } from '@playwright/test';

// #610: every visible text inside a Docs story is set in the design-system typography, never in the browser's
// default serif (a story that renders without the canvas root font inherits "Times New Roman"). The scan covers
// EVERY Docs page of the build (Free and Pro), reports page + element, and skips what a sighted user never sees
// (sr-only text, style/script/noscript, display:none).

interface Offender {
  element: string;
  text: string;
  fontFamily: string;
}

/** Runs inside the page: the elements under `.docs-story` with visible own text whose font stack is a serif one. */
function scanSerifText(): Offender[] {
  const SKIP_TAGS = new Set(['STYLE', 'SCRIPT', 'NOSCRIPT', 'TEMPLATE']);
  const offenders: Offender[] = [];
  const isHidden = (el: Element) => {
    for (let node: Element | null = el; node && !node.matches('.docs-story'); node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      const clipped = cs.clip !== 'auto' || cs.clipPath !== 'none';
      // sr-only: a 1px absolutely-positioned box that clips its content.
      if (cs.position === 'absolute' && rect.width <= 1 && rect.height <= 1 && (clipped || cs.overflow === 'hidden')) return true;
    }
    return false;
  };
  // A stack is the design-system one when it ends in a sans-serif or monospace generic family; the browser
  // default (Times New Roman) has no such generic.
  const isDesignSystemStack = (stack: string) => /(^|,)\s*(sans-serif|system-ui|monospace|ui-monospace)\s*$/i.test(stack.trim());
  const describe = (el: Element) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  for (const root of document.querySelectorAll('.docs-story')) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || seen.has(parent) || !node.textContent?.trim()) continue;
      if (SKIP_TAGS.has(parent.tagName) || parent.closest('style,script,noscript,template')) continue;
      seen.add(parent);
      if (isHidden(parent)) continue;
      const fontFamily = getComputedStyle(parent).fontFamily;
      if (!isDesignSystemStack(fontFamily)) {
        offenders.push({ element: describe(parent), text: (node.textContent ?? '').trim().slice(0, 40), fontFamily });
      }
    }
  }
  return offenders;
}

async function docsPageIds(page: Page): Promise<string[]> {
  const response = await page.request.get('/index.json');
  const index = (await response.json()) as { entries: Record<string, { id: string; type: string }> };
  return Object.values(index.entries)
    .filter((entry) => entry.type === 'docs')
    .map((entry) => entry.id)
    .sort();
}

async function openDocs(page: Page, id: string): Promise<void> {
  await page.goto(`/iframe.html?id=${id}&viewMode=docs`);
  await page.locator('.sbdocs-content').waitFor({ timeout: 30_000 });
  // Stories render after the template: wait until every .docs-story has content.
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.docs-story')).every((s) => s.querySelector('*')),
    undefined,
    { timeout: 30_000 },
  );
}

test.describe('Docs typography (#610)', () => {
  test('no visible text inside a Docs story is in the default serif, on any Docs page (Free and Pro)', async ({ page }) => {
    test.setTimeout(900_000);
    const ids = await docsPageIds(page);
    expect(ids.length, 'the build lists Docs pages').toBeGreaterThan(50);
    const problems: string[] = [];
    let scannedStories = 0;
    for (const id of ids) {
      await openDocs(page, id);
      scannedStories += await page.locator('.docs-story').count();
      for (const o of await page.evaluate(scanSerifText)) problems.push(`${id}: <${o.element}> "${o.text}" -> ${o.fontFamily}`);
    }
    expect(scannedStories, 'the scan reached some stories').toBeGreaterThan(100);
    expect(problems).toEqual([]);
  });

  test('the scan does fail on a serif text added on purpose (and ignores sr-only / style / script)', async ({ page }) => {
    await openDocs(page, 'primitives-button--docs');
    await page.evaluate(() => {
      const story = document.querySelector('.docs-story')!;
      const host = document.createElement('div');
      host.innerHTML =
        '<p id="serif-probe" style="font-family: \'Times New Roman\', serif">visible serif</p>' +
        '<span id="sr-probe" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);font-family:serif">hidden serif</span>' +
        '<style id="style-probe" style="display:block;font-family:serif">.x{color:red}</style>';
      story.appendChild(host);
    });
    const offenders = await page.evaluate(scanSerifText);
    // Only the visible probe is new: the sr-only span and the style element are ignored.
    expect(offenders.map((o) => o.element).filter((e) => e.includes('probe'))).toEqual(['p#serif-probe']);
  });
});
