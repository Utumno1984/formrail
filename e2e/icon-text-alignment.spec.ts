import { expect, test, type Page } from '@playwright/test';
import { expectPlayToPass } from './helpers/story';

// Ticket #217: an icon (or a control drawn like one) next to a line of text is centred on the
// cap height of that line, measured in numbers at several device pixel ratios, not only by
// screenshot. The icon centre is its real layout box (SVG or native input); the cap centre is the
// real INK of the first capital letter of the text, read from the pixels of a screenshot (a font
// formula would hide exactly the per-font differences this test is about).
//
// Button is not in the list: its icon stays on the box centre while the plain-text label is moved
// 1px up (deliberate, covered by e2e/button.spec.ts).

const STORY = 'internal-icontextalignment--all-pairs';
// Cases rendered in a portal (or only once opened) cannot share the AllPairs page: each has its own
// story, the play function of which tags the portaled node as a `data-align-case`.
const PORTALED_STORIES = [
  'internal-icontextalignment--toast-pair',
  'internal-icontextalignment--select-option-pair',
  'internal-icontextalignment--combobox-option-pair',
];
// Half a device pixel of quantisation of the ink at 1x, plus anti-aliasing: well below the 1-3px
// offsets this test guards against (WenQuanYi Zen Hei: +2px before the fix, Text icons: +1.2-2px).
const TOLERANCE = 0.75;

// Cases measured with the extreme-metrics font: every CapIconSlot consumer except the ones whose
// own e2e covers them (badges, Text, Button).
const CROSS_FONT_CASES = [
  'checkbox',
  'switch',
  'radio',
  'message-strip',
  'field-message-error',
  'list-report-sort-arrow',
  'object-page-footer',
  'toast',
  'select-option',
  'combobox-option',
];

interface Measure {
  name: string;
  iconCentre: number;
  capCentre: number | null;
  capChar: string;
}

async function measure(page: Page, dpr: number): Promise<Measure[]> {
  await page.evaluate(() => document.fonts.ready);
  const png = (await page.screenshot({ fullPage: true, scale: 'device', animations: 'disabled' })).toString('base64');
  return page.evaluate(
    async ({ png, dpr }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const g = canvas.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      const sx = window.scrollX;
      const sy = window.scrollY;

      // Vertical centre (CSS px, viewport) of the longest run of ink rows inside `r`; background =
      // most frequent colour of the block, so a tinted badge background is not ink.
      const inkCentre = (r: { left: number; right: number; top: number; bottom: number }): number | null => {
        const x0 = Math.floor((r.left + sx) * dpr);
        const x1 = Math.ceil((r.right + sx) * dpr);
        const y0 = Math.round((r.top + sy) * dpr);
        const y1 = Math.round((r.bottom + sy) * dpr);
        const w = x1 - x0;
        const h = y1 - y0;
        if (w <= 0 || h <= 0) return null;
        const d = g.getImageData(x0, y0, w, h).data;
        const freq = new Map<number, number>();
        let bg = [d[0]!, d[1]!, d[2]!];
        let best = 0;
        for (let i = 0; i < d.length; i += 4) {
          const k = (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!;
          const n = (freq.get(k) ?? 0) + 1;
          freq.set(k, n);
          if (n > best) {
            best = n;
            bg = [d[i]!, d[i + 1]!, d[i + 2]!];
          }
        }
        let top = -1;
        let bot = -1;
        let runTop = -1;
        for (let y = 0; y <= h; y++) {
          let ink = false;
          if (y < h) {
            for (let x = 0; x < w && !ink; x++) {
              const i = (y * w + x) * 4;
              const diff = (Math.abs(d[i]! - bg[0]!) + Math.abs(d[i + 1]! - bg[1]!) + Math.abs(d[i + 2]! - bg[2]!)) / 765;
              ink = diff > 0.15;
            }
          }
          if (ink && runTop < 0) runTop = y;
          if (!ink && runTop >= 0) {
            if (top < 0 || y - runTop > bot + 1 - top) {
              top = runTop;
              bot = y - 1;
            }
            runTop = -1;
          }
        }
        if (top < 0) return null;
        return (y0 + (top + bot + 1) / 2) / dpr - sy;
      };

      return Array.from(document.querySelectorAll<HTMLElement>('[data-align-case]')).map((c) => {
        const icon = c.querySelector(c.dataset.alignIcon!)!.getBoundingClientRect();
        const textEl = c.querySelector(c.dataset.alignText!)!;
        const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode() as Text | null;
        while (node && !node.data.trim()) node = walker.nextNode() as Text | null;
        const s = node!.data;
        const idx = s.search(/[A-Z0-9]/);
        const range = document.createRange();
        range.setStart(node!, idx);
        range.setEnd(node!, idx + 1);
        const ch = range.getBoundingClientRect();
        const t = textEl.getBoundingClientRect();
        return {
          name: c.dataset.alignCase!,
          iconCentre: icon.top + icon.height / 2,
          capCentre: inkCentre({ left: ch.left, right: ch.right, top: Math.max(ch.top, t.top), bottom: Math.min(ch.bottom, t.bottom) }),
          capChar: s[idx]!,
        };
      });
    },
    { png, dpr },
  );
}

for (const dpr of [1, 2, 3]) {
  test.describe(`icon/text alignment at ${dpr}x`, () => {
    test.use({ deviceScaleFactor: dpr, viewport: { width: 800, height: 900 } });

    test('every icon is centred on the cap height of its text line', async ({ page }) => {
      await expectPlayToPass(page, STORY);
      const rows = (await measure(page, dpr)).filter((r) => !r.name.startsWith('button-'));
      expect(rows.map((r) => r.name)).toEqual([
        'status-badge-info',
        'status-badge-success',
        'status-badge-warning',
        'status-badge-error',
        'checkbox',
        'switch',
        'radio',
        'field-message-error',
        'message-strip',
        'list-report-sort-arrow',
        'object-page-footer',
        'text-caption-icon',
        'text-body-icon',
      ]);
      const offsets = rows.map((r) => ({
        name: r.name,
        capChar: r.capChar,
        offset: r.capCentre === null ? null : Math.round((r.iconCentre - r.capCentre) * 100) / 100,
      }));
      for (const o of offsets) {
        expect(o.offset, `${o.name} (cap "${o.capChar}") at ${dpr}x: ${JSON.stringify(offsets)}`).not.toBeNull();
        expect(Math.abs(o.offset!), `${o.name} (cap "${o.capChar}") at ${dpr}x: ${JSON.stringify(offsets)}`).toBeLessThanOrEqual(TOLERANCE);
      }
    });
  });
}

test('the alignment does not depend on the font: a font whose glyphs sit high in the line box', async ({ page }) => {
  // A font with an unusually large descent (glyphs high in the line box): line-box centring puts
  // the icon well below the capitals, cap centring does not care. Built from the local sans-serif
  // with `descent-override`, so no font file is needed.
  const rows: Measure[] = [];
  for (const story of [STORY, ...PORTALED_STORIES]) {
    await expectPlayToPass(page, story);
    await page.addStyleTag({
      content:
        "@font-face { font-family: 'RopHighGlyphs'; src: local('Liberation Sans'), local('Arial'), local('DejaVu Sans'), local('Helvetica'); ascent-override: 80%; descent-override: 60%; }" +
        ':root { --font-rop-sans: RopHighGlyphs, sans-serif !important; }',
    });
    await page.evaluate(() => document.fonts.ready);
    rows.push(...(await measure(page, 1)).filter((r) => CROSS_FONT_CASES.includes(r.name)));
  }
  // Explicit count: a component added to a fixture but not to this list (or dropped from a fixture)
  // fails here instead of going unmeasured.
  expect(rows).toHaveLength(CROSS_FONT_CASES.length);
  expect(rows.map((r) => r.name).sort()).toEqual([...CROSS_FONT_CASES].sort());
  for (const r of rows) {
    expect(r.capCentre, r.name).not.toBeNull();
    expect(Math.abs(r.iconCentre - r.capCentre!), `${r.name}: icon ${r.iconCentre} cap ${r.capCentre}`).toBeLessThanOrEqual(TOLERANCE);
  }
});
