import { expect, test } from '@playwright/test';
import { gotoStory } from './helpers/story';

const VPS = [
  ['desktop', { width: 1280, height: 800 }, 'ltr'],
  ['tablet', { width: 768, height: 1024 }, 'ltr'],
  ['mobile', { width: 375, height: 667 }, 'ltr'],
  ['rtl', { width: 1280, height: 800 }, 'rtl'],
] as const;

for (const [vp, size, dir] of VPS) {
  test.describe('QA3 #140 proximity ' + vp, () => {
    test.use({ viewport: size });

    test('Overview: help sits closer to its control than to the next field', async ({ page }) => {
      await gotoStory(page, 'forms-field--overview');
      if (dir === 'rtl') await page.evaluate(() => (document.documentElement.dir = 'rtl'));
      const r = await page.evaluate(() => {
        const out: Record<string, { toHelp: number; toNext: number }> = {};
        for (const id of ['f-help', 'f-error']) {
          const f = document.querySelector('[data-testid="' + id + '"]') as HTMLElement;
          const input = f.querySelector('input') as HTMLElement;
          const box = (input.closest('div[class*="rounded"]') ?? input).getBoundingClientRect();
          const help = f.querySelector('[id$="-help"]') as HTMLElement;
          const hb = help.getBoundingClientRect();
          const next = (f.nextElementSibling as HTMLElement).getBoundingClientRect();
          out[id] = { toHelp: hb.top - box.bottom, toNext: next.top - hb.bottom };
        }
        return out;
      });
      console.log(vp, JSON.stringify(r));
      for (const [k, v] of Object.entries(r)) expect(v.toHelp, k).toBeLessThan(v.toNext);
    });

    for (const args of [
      'help:Helpline',
      'help:Helpline;state:forced;stateReason:Because+rule',
      'help:;state:forced;stateReason:Because+rule',
    ]) {
      test('Playground ' + args + ': stack order and slot last', async ({ page }) => {
        await gotoStory(page, 'forms-field--playground', args);
        if (dir === 'rtl') await page.evaluate(() => (document.documentElement.dir = 'rtl'));
        const r = await page.evaluate(() => {
          const slot = document.querySelector('[data-field-error-slot]') as HTMLElement;
          const field = slot.parentElement as HTMLElement;
          const input = field.querySelector('input') as HTMLElement;
          const box = (input.closest('div[class*="rounded"]') ?? input).getBoundingClientRect();
          const msgs = [...field.querySelectorAll('[id$="-reason"],[id$="-help"]')].map((m) => ({
            id: m.id.split('-').pop(),
            top: m.getBoundingClientRect().top,
            bottom: m.getBoundingClientRect().bottom,
          }));
          const s = slot.getBoundingClientRect();
          return { boxBottom: box.bottom, msgs, slotTop: s.top, slotBottom: s.bottom, fieldBottom: field.getBoundingClientRect().bottom };
        });
        console.log(vp, args, JSON.stringify(r));
        let prev = r.boxBottom;
        for (const m of r.msgs) {
          expect(m.top).toBeGreaterThanOrEqual(prev - 0.5);
          expect(m.top - prev).toBeLessThan(8);
          prev = m.bottom;
        }
        expect(r.slotTop).toBeGreaterThanOrEqual(prev - 0.5);
        expect(r.slotBottom).toBeCloseTo(r.fieldBottom, 1);
        expect(r.slotBottom - r.slotTop).toBeCloseTo(20, 0);
      });
    }
  });
}

test('tab order: error slot not focusable', async ({ page }) => {
  await gotoStory(page, 'forms-field--error-reserves-space');
  await page.getByRole('button', { name: 'Show error', exact: true }).click();
  const seq: string[] = [];
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    seq.push(
      await page.evaluate(
        () => (document.activeElement?.tagName ?? '') + ':' + (document.activeElement?.textContent || (document.activeElement as HTMLInputElement)?.value || ''),
      ),
    );
  }
  console.log(seq.join(' | '));
  expect(seq).toEqual(['BUTTON:Show error', 'BUTTON:Show long error', 'BUTTON:Clear', 'INPUT:12345', 'INPUT:Acme']);
});

test('accessible description order with error, help, reason', async ({ page }) => {
  await gotoStory(page, 'forms-field--playground', 'help:Helpline;error:Bad+value;state:forced;stateReason:Because+rule');
  await expect(page.getByRole('textbox')).toHaveAccessibleDescription('Because rule Bad value Helpline');
});
