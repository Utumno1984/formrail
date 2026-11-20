import { expect, test, type Page } from '@playwright/test';

// #610: every visible text inside a Docs story (and inside the portals a story opens) is set in the design-system
// typography, never in the browser's default serif (a story that renders without the canvas root font inherits
// "Times New Roman"). The scan covers EVERY Docs page of the build (Free and Pro), reports page + element, and
// skips what a sighted user never sees (sr-only text, style/script/noscript, display:none).
// The Storybook UI around the stories (toolbar, Controls panel) is NOT touched by the canvas font: asserted below.

interface Offender {
  element: string;
  text: string;
  fontFamily: string;
}

/**
 * Runs inside the page: the elements with visible own text whose computed font stack is not the design-system one.
 * `scope` 'stories' scans every `.docs-story`; 'portals' scans what is mounted on `body` outside the Docs page
 * (dialog, tooltip, popover), where the overlay of a story lives.
 */
function scanSerifText(scope: 'stories' | 'portals'): Offender[] {
  const SKIP_TAGS = new Set(['STYLE', 'SCRIPT', 'NOSCRIPT', 'TEMPLATE']);
  const offenders: Offender[] = [];
  const stackOf = (cssValue: string) => {
    const probe = document.createElement('span');
    probe.style.fontFamily = cssValue;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).fontFamily;
    probe.remove();
    return resolved;
  };
  // Accepted: the stack of the design-system sans token (read from the page) or of its mono token (code blocks).
  // Ending in a generic family is NOT enough: "Georgia, sans-serif" is a serif text.
  // Also exact (never a suffix match): the browser's own `monospace` of a bare code/pre block, and the
  // `system-ui, sans-serif` that many stories declare on their own page wrapper (a deliberate sans stack of the story).
  const allowed = new Set([stackOf('var(--font-rop-sans)'), stackOf('var(--font-rop-mono)'), 'monospace', 'system-ui, sans-serif']);
  const roots: Element[] =
    scope === 'stories'
      ? Array.from(document.querySelectorAll('.docs-story'))
      : Array.from(document.body.children).filter(
          (child) =>
            !SKIP_TAGS.has(child.tagName) &&
            !child.matches('#storybook-root, #storybook-docs') &&
            !child.querySelector('.sbdocs') &&
            !/(^|\s)sb-/.test(typeof child.className === 'string' ? child.className : ''),
        );
  const isHidden = (el: Element, root: Element) => {
    for (let node: Element | null = el; node && node !== root.parentElement; node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      const clipped = cs.clip !== 'auto' || cs.clipPath !== 'none';
      // sr-only: a 1px absolutely-positioned box that clips its content.
      if (cs.position === 'absolute' && rect.width <= 1 && rect.height <= 1 && (clipped || cs.overflow === 'hidden')) return true;
    }
    return false;
  };
  const describe = (el: Element) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || seen.has(parent) || !node.textContent?.trim()) continue;
      if (SKIP_TAGS.has(parent.tagName) || parent.closest('style,script,noscript,template')) continue;
      seen.add(parent);
      if (isHidden(parent, root)) continue;
      const fontFamily = getComputedStyle(parent).fontFamily;
      if (!allowed.has(fontFamily)) {
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
      for (const o of await page.evaluate(scanSerifText, 'stories' as const)) problems.push(`${id}: <${o.element}> "${o.text}" -> ${o.fontFamily}`);
    }
    expect(scannedStories, 'the scan reached some stories').toBeGreaterThan(100);
    expect(problems).toEqual([]);
  });

  test('the text of a real Dialog opened from a Docs story (a portal on body) is in the design-system font', async ({ page }) => {
    await openDocs(page, 'data-listreportfilterbar--docs');
    await page.locator('[id="anchor--data-listreportfilterbar--inside-dialog"]').getByRole('button', { name: 'Open filters' }).click();
    const dialog = page.getByRole('dialog', { name: 'Filter invoices' });
    await expect(dialog).toBeVisible();
    // The dialog is mounted on body, outside .docs-story: the scan must reach it, and it includes its native controls.
    await expect(page.locator('.docs-story').getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(scanSerifText, 'portals' as const)).toEqual([]);
    const controlFont = await dialog.locator('button, input').first().evaluate((el) => getComputedStyle(el).fontFamily);
    const sans = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.fontFamily = 'var(--font-rop-sans)';
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).fontFamily;
      probe.remove();
      return resolved;
    });
    expect(controlFont).toBe(sans);
  });

  test('the scan does fail on a serif text added on purpose (and ignores sr-only / style / script)', async ({ page }) => {
    await openDocs(page, 'primitives-button--docs');
    await page.evaluate(() => {
      const story = document.querySelector('.docs-story')!;
      const host = document.createElement('div');
      host.innerHTML =
        '<p id="serif-probe" style="font-family: \'Times New Roman\', serif">visible serif</p>' +
        // A serif family followed by a generic sans one: the stack ends in "sans-serif" but is not the design-system one.
        '<p id="georgia-probe" style="font-family: Georgia, sans-serif">visible georgia</p>' +
        '<span id="sr-probe" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);font-family:serif">hidden serif</span>' +
        '<style id="style-probe" style="display:block;font-family:serif">.x{color:red}</style>';
      story.appendChild(host);
    });
    const offenders = await page.evaluate(scanSerifText, 'stories' as const);
    // Only the two visible probes are new: the sr-only span and the style element are ignored.
    expect(offenders.map((o) => o.element).filter((e) => e.includes('probe'))).toEqual(['p#serif-probe', 'p#georgia-probe']);
  });

  test('the Storybook UI of a Docs page (toolbar, Controls panel) keeps its own fonts: the canvas font does not reach it', async ({ page }) => {
    await openDocs(page, 'primitives-button--docs');
    const result = await page.evaluate(() => {
      const sans = (() => {
        const probe = document.createElement('span');
        probe.style.fontFamily = 'var(--font-rop-sans)';
        document.body.appendChild(probe);
        const resolved = getComputedStyle(probe).fontFamily;
        probe.remove();
        return resolved;
      })();
      const outside = (selector: string) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((el) => !el.closest('.docs-story'));
      const fonts = (els: HTMLElement[]) => els.map((el) => getComputedStyle(el).fontFamily);
      return {
        sans,
        buttons: fonts(outside('.sbdocs button')),
        textareas: fonts(outside('.sbdocs textarea')),
        radios: fonts(outside('.sbdocs input[type="radio"], .sbdocs input[type="checkbox"]')),
        inputs: fonts(outside('.sbdocs input, .sbdocs select')),
      };
    });
    expect(result.buttons.length, 'the page has Storybook buttons outside the stories (toolbar)').toBeGreaterThan(0);
    expect(result.textareas.length, 'the Controls panel has text areas').toBeGreaterThan(0);
    expect(result.radios.length, 'the Controls panel has radios/checkboxes').toBeGreaterThan(0);
    for (const font of [...result.buttons, ...result.radios, ...result.inputs]) expect(font).not.toBe(result.sans);
    // Storybook's own Controls text areas are monospace, not the canvas sans.
    for (const font of result.textareas) {
      expect(font).not.toBe(result.sans);
      expect(font.toLowerCase()).toContain('monospace');
    }
  });
});
