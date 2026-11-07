import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectFocusRingVisible, expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass } from './helpers/story';

// The states of the form controls side by side (#223). The pictures are the visual regression of
// `Internal/ControlStates` (mobile, tablet, desktop); here the computed styles are asserted, so a
// state that looks like another one fails even when nobody looks at the pictures. Colours are compared
// with the real tokens read in the page (a probe element), never with hand-copied values.
const MATRIX = 'internal-controlstates--matrix';
const CALENDAR = 'internal-controlstates--calendar-matrix';

const STATES = ['default', 'invalid', 'disabled', 'forced', 'locked', 'locked-invalid'] as const;
type State = (typeof STATES)[number];
const BLOCKED: readonly State[] = ['forced', 'locked', 'locked-invalid'];
const NOT_BLOCKED: readonly State[] = ['default', 'invalid', 'disabled'];
const KINDS = [
  'checkbox-unchecked',
  'checkbox-checked',
  'checkbox-indeterminate',
  'switch-off',
  'switch-on',
  'radio',
  'input',
  'select',
  'combobox',
] as const;
type Kind = (typeof KINDS)[number];
/** The kinds that show an "on" indicator (tick / dash, thumb at the end, dot). */
const ON: readonly Kind[] = ['checkbox-checked', 'checkbox-indeterminate', 'switch-on', 'radio'];
/** The kinds whose "on" part is a fill of the box itself (the radio's is the dot). */
const FILLED: readonly Kind[] = ['checkbox-checked', 'checkbox-indeterminate', 'switch-on'];

// Transitions off: every style is read in its final state.
test.use({ reducedMotion: 'reduce' });

const cell = (page: Page, kind: Kind | 'calendar', state: string) => page.getByTestId(`cell-${kind}-${state}`);

/** The element that draws the box of the control (the selected radio for a RadioGroup). */
function box(page: Page, kind: Kind, state: State): Locator {
  const c = cell(page, kind, state);
  if (kind === 'radio') return c.getByRole('radio', { name: 'Yearly' });
  if (kind.startsWith('checkbox')) return c.getByRole('checkbox');
  if (kind.startsWith('switch')) return c.getByRole('switch');
  return c.getByRole(kind === 'input' ? 'textbox' : 'combobox');
}

interface Look {
  borderStyles: string[];
  borderColors: string[];
  borderWidths: string[];
  background: string;
  /** Colour of the visible "on" part: the shown tick / dash, the thumb, the dot. Null if none. */
  mark: string | null;
  /** Product of the opacities from the box up to its cell (disabled dims the row, not the box). */
  opacity: number;
  width: number;
  height: number;
  /** Switch: centre of the thumb minus centre of the track. */
  thumbOffset: number | null;
}

function look(page: Page, kind: Kind, state: State): Promise<Look> {
  return box(page, kind, state).evaluate((el, k) => {
    const cs = getComputedStyle(el);
    const sides = ['top', 'right', 'bottom', 'left'];
    let mark: string | null = null;
    let thumbOffset: number | null = null;
    if (k.startsWith('checkbox')) {
      const shown = Array.from(el.parentElement!.querySelectorAll('svg')).find((s) => getComputedStyle(s).display !== 'none');
      mark = shown ? getComputedStyle(shown).color : null;
    } else if (k.startsWith('switch')) {
      const thumb = el.nextElementSibling as HTMLElement;
      mark = getComputedStyle(thumb).backgroundColor;
      const t = thumb.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      thumbOffset = t.left + t.width / 2 - (r.left + r.width / 2);
    } else if (k === 'radio') {
      const dot = el.nextElementSibling as HTMLElement;
      mark = getComputedStyle(dot).display === 'none' ? null : getComputedStyle(dot).backgroundColor;
    }
    let opacity = 1;
    for (let node: Element | null = el; node && !node.hasAttribute('data-testid'); node = node.parentElement) {
      opacity *= Number(getComputedStyle(node).opacity);
    }
    const rect = el.getBoundingClientRect();
    return {
      borderStyles: sides.map((s) => cs.getPropertyValue(`border-${s}-style`)),
      borderColors: sides.map((s) => cs.getPropertyValue(`border-${s}-color`)),
      borderWidths: sides.map((s) => cs.getPropertyValue(`border-${s}-width`)),
      background: cs.backgroundColor,
      mark,
      opacity: Math.round(opacity * 100) / 100,
      width: rect.width,
      height: rect.height,
      thumbOffset,
    };
  }, kind);
}

type Tokens = Record<'primary' | 'error' | 'surface' | 'readonlySurface' | 'readonlyIndicator' | 'text' | 'primaryContrast', string>;

/**
 * The real token colours, resolved by the browser. A base token is read through a `var()` on a probe;
 * a derived token has no value to read with a bare `var()` (an unset override slot, see tokens.css),
 * so the probe gets the compiled utility the components use and the browser resolves that.
 */
function tokens(page: Page): Promise<Tokens> {
  return page.evaluate(() => {
    const computed = (setup: (probe: HTMLElement) => void, value: (style: CSSStyleDeclaration) => string) => {
      const probe = document.createElement('div');
      setup(probe);
      document.body.append(probe);
      const color = value(getComputedStyle(probe));
      probe.remove();
      return color;
    };
    const read = (name: string) =>
      computed(
        (probe) => {
          probe.style.backgroundColor = `var(--color-rop-${name})`;
        },
        (style) => style.backgroundColor,
      );
    return {
      primary: read('primary'),
      error: read('error'),
      surface: read('surface'),
      readonlySurface: computed(
        (probe) => {
          probe.className = 'not-forced-colors:bg-rop-readonly-surface';
        },
        (style) => style.backgroundColor,
      ),
      readonlyIndicator: computed(
        (probe) => {
          probe.className = 'not-forced-colors:border-rop-readonly-indicator';
        },
        (style) => style.borderTopColor,
      ),
      text: read('text'),
      primaryContrast: read('primary-contrast'),
    };
  });
}

for (const [name, viewport] of [
  ['mobile', { width: 375, height: 667 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(`control states matrix (${name})`, () => {
    test.use({ viewport });

    test('(1) the play functions pass and nothing overflows the viewport', async ({ page }) => {
      for (const story of [MATRIX, CALENDAR]) {
        await expectPlayToPass(page, story);
        await expectNoHorizontalOverflow(page.locator('#storybook-root'));
      }
    });
  });
}

test('(1b) with the Field messages on, the play function passes too (reasons and errors described)', async ({ page }) => {
  await expectPlayToPass(page, MATRIX, 'withMessages:!true');
  await expect(cell(page, 'input', 'forced').getByText('Decided by the framework agreement.')).toBeVisible();
  await expect(cell(page, 'input', 'invalid').getByText('Required.')).toBeVisible();
  await expectPlayToPass(page, CALENDAR, 'withMessages:!true');
});

test.describe('control states matrix: computed styles', () => {
  test.beforeEach(async ({ page }) => {
    await expectPlayToPass(page, MATRIX);
  });

  test('(2) forced / locked: dashed on the four sides; default / invalid / disabled: solid', async ({ page }) => {
    for (const kind of KINDS) {
      for (const state of STATES) {
        const l = await look(page, kind, state);
        const expected = BLOCKED.includes(state) ? 'dashed' : 'solid';
        expect(l.borderStyles, `${kind} ${state}`).toEqual([expected, expected, expected, expected]);
      }
    }
  });

  test('(3) forced / locked: read-only surface, neutral indicator, no primary or error fill', async ({ page }) => {
    const t = await tokens(page);
    for (const kind of KINDS) {
      for (const state of BLOCKED) {
        const l = await look(page, kind, state);
        expect(l.background, `${kind} ${state} surface`).toBe(t.readonlySurface);
        if (ON.includes(kind)) expect(l.mark, `${kind} ${state} indicator`).toBe(t.readonlyIndicator);
        for (const colour of [l.background, l.mark, ...l.borderColors]) {
          expect(colour, `${kind} ${state}: no primary`).not.toBe(t.primary);
        }
        if (state !== 'locked-invalid') expect(l.borderColors, `${kind} ${state}: no error`).not.toContain(t.error);
        expect(l.opacity, `${kind} ${state}: full opacity`).toBe(1);
      }
    }
  });

  test('(4) invalid: error border, and the "on" indicator is error on Checkbox, Switch and Radio alike', async ({ page }) => {
    const t = await tokens(page);
    for (const kind of KINDS) {
      const l = await look(page, kind, 'invalid');
      expect(l.borderColors, `${kind} border`).toEqual([t.error, t.error, t.error, t.error]);
      if (FILLED.includes(kind)) expect(l.background, `${kind} fill`).toBe(t.error);
      if (kind === 'radio') expect(l.mark, 'radio dot').toBe(t.error);
      // The tick / dash / thumb on the red fill is the same contrast colour as on the blue one.
      if (FILLED.includes(kind)) expect(l.mark, `${kind} mark`).toBe(t.primaryContrast);
    }
  });

  test('(5) locked + invalid: error dashed border, neutral indicator, read-only surface', async ({ page }) => {
    const t = await tokens(page);
    for (const kind of KINDS) {
      const l = await look(page, kind, 'locked-invalid');
      expect(l.borderColors, `${kind} border`).toEqual([t.error, t.error, t.error, t.error]);
      expect(l.borderStyles[0], kind).toBe('dashed');
      expect(l.background, `${kind} surface`).toBe(t.readonlySurface);
      if (ON.includes(kind)) expect(l.mark, `${kind} indicator`).toBe(t.readonlyIndicator);
    }
  });

  test('(6) disabled: 0.5 opacity, solid border, primary indicator', async ({ page }) => {
    const t = await tokens(page);
    for (const kind of KINDS) {
      const l = await look(page, kind, 'disabled');
      expect(l.opacity, kind).toBe(0.5);
      expect(l.borderStyles[0], kind).toBe('solid');
      if (FILLED.includes(kind)) expect(l.background, `${kind} fill`).toBe(t.primary);
      if (kind === 'radio') expect(l.mark, 'radio dot').toBe(t.primary);
    }
  });

  test('(7) default: primary indicator, solid border, full opacity', async ({ page }) => {
    const t = await tokens(page);
    for (const kind of KINDS) {
      const l = await look(page, kind, 'default');
      expect(l.opacity, kind).toBe(1);
      expect(l.borderStyles[0], kind).toBe('solid');
      if (FILLED.includes(kind)) {
        expect(l.background, `${kind} fill`).toBe(t.primary);
        expect(l.mark, `${kind} mark`).toBe(t.primaryContrast);
      }
      if (kind === 'radio') {
        expect(l.mark, 'radio dot').toBe(t.primary);
        expect(l.borderColors[0], 'radio border').toBe(t.primary);
      }
      if (!FILLED.includes(kind)) expect(l.background, `${kind} surface`).toBe(t.surface);
    }
  });

  test('(8) forced and locked have the very same computed look', async ({ page }) => {
    // Everything but the width: the two cells are different tracks of a fractional grid (sub-pixel);
    // the width is compared with a tolerance in (9).
    const paintOf = async (kind: Kind, state: State) => {
      const { width, ...rest } = await look(page, kind, state);
      return { ...rest, width: Math.round(width) };
    };
    for (const kind of KINDS) {
      expect(await paintOf(kind, 'forced'), kind).toEqual(await paintOf(kind, 'locked'));
    }
  });

  test('(9) the box has the same size in every state (no layout shift); the switch thumb keeps its place', async ({ page }) => {
    for (const kind of KINDS) {
      const reference = await look(page, kind, 'default');
      for (const state of STATES) {
        const l = await look(page, kind, state);
        expect(l.height, `${kind} ${state} height`).toBe(reference.height);
        expect(Math.abs(l.width - reference.width), `${kind} ${state} width`).toBeLessThan(0.5);
        expect(l.borderWidths, `${kind} ${state} border width`).toEqual(reference.borderWidths);
        if (reference.thumbOffset !== null) expect(l.thumbOffset, `${kind} ${state} thumb`).toBeCloseTo(reference.thumbOffset, 1);
      }
    }
    // On: the thumb sits at the end; off: at the start, in every state (blocked included).
    for (const state of STATES) {
      expect((await look(page, 'switch-on', state)).thumbOffset!, state).toBeGreaterThan(0);
      expect((await look(page, 'switch-off', state)).thumbOffset!, state).toBeLessThan(0);
    }
  });

  test('(11) hovering a forced / locked control changes nothing (a default one does change)', async ({ page }) => {
    const hover = async (kind: Kind, state: State) => {
      const target = kind === 'select' ? box(page, kind, state) : cell(page, kind, state).getByText(kind === 'radio' ? 'Yearly' : 'Option', { exact: true });
      await page.mouse.move(0, 0);
      const before = await look(page, kind, state);
      await target.hover();
      const after = await look(page, kind, state);
      await page.mouse.move(0, 0);
      return { before: before.background, after: after.background };
    };
    // The hover really works in this browser: a default unchecked box changes.
    const live = await hover('checkbox-unchecked', 'default');
    expect(live.after).not.toBe(live.before);
    for (const kind of ['checkbox-unchecked', 'checkbox-checked', 'switch-off', 'switch-on', 'radio', 'select'] as const) {
      for (const state of BLOCKED) {
        const { before, after } = await hover(kind, state);
        expect(after, `${kind} ${state}`).toBe(before);
      }
    }
  });

  test('(12) Tab reaches every forced / locked control (never a disabled one) and its focus ring is visible', async ({ page }) => {
    await page.mouse.click(1, 1);
    const reached = new Set<string>();
    for (let i = 0; i < 120; i++) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => document.activeElement?.closest('[data-testid]')?.getAttribute('data-testid') ?? null);
      if (id === null && i > 0) break;
      if (id) reached.add(id);
    }
    for (const kind of KINDS) {
      for (const state of BLOCKED) expect(reached.has(`cell-${kind}-${state}`), `${kind} ${state} reached`).toBe(true);
      expect(reached.has(`cell-${kind}-disabled`), `${kind} disabled skipped`).toBe(false);
    }
    for (const kind of KINDS) {
      for (const state of BLOCKED) await expectFocusRingVisible(box(page, kind, state));
    }
  });
});

test('(10) forced-colors: forced / locked stay dashed, the others solid', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await expectPlayToPass(page, MATRIX);
  for (const kind of KINDS) {
    for (const state of STATES) {
      const l = await look(page, kind, state);
      expect(l.borderStyles[0], `${kind} ${state}`).toBe(BLOCKED.includes(state) ? 'dashed' : 'solid');
    }
  }
  await expectPlayToPass(page, CALENDAR);
  for (const state of STATES) {
    const style = await cell(page, 'calendar', state).getByRole('group').evaluate((el) => getComputedStyle(el).borderTopStyle);
    expect(style, `calendar ${state}`).toBe(BLOCKED.includes(state) ? 'dashed' : 'solid');
  }
});

interface CalendarLook {
  rootStyles: string[];
  rootColor: string;
  rootBackground: string;
  opacity: number;
  dayBackground: string | null;
  dayBorder: string | null;
  dayColor: string | null;
  width: number;
  height: number;
}

function calendarLook(page: Page, state: string): Promise<CalendarLook> {
  return cell(page, 'calendar', state)
    .getByRole('group')
    .evaluate((root) => {
      const cs = getComputedStyle(root);
      const selected = root.querySelector<HTMLElement>('[aria-selected="true"] > span');
      const day = selected ? getComputedStyle(selected) : null;
      const rect = root.getBoundingClientRect();
      return {
        rootStyles: ['top', 'right', 'bottom', 'left'].map((s) => cs.getPropertyValue(`border-${s}-style`)),
        rootColor: cs.borderTopColor,
        rootBackground: cs.backgroundColor,
        opacity: Number(cs.opacity),
        dayBackground: day?.backgroundColor ?? null,
        dayBorder: day?.borderTopColor ?? null,
        dayColor: day?.color ?? null,
        width: rect.width,
        height: rect.height,
      };
    });
}

test.describe('calendar matrix: computed styles', () => {
  test.beforeEach(async ({ page }) => {
    await expectPlayToPass(page, CALENDAR);
  });

  test('default / invalid / disabled: solid frame, the selected day filled with primary / error / primary', async ({ page }) => {
    const t = await tokens(page);
    const fills: Record<string, string> = { default: t.primary, invalid: t.error, disabled: t.primary };
    for (const state of NOT_BLOCKED) {
      const l = await calendarLook(page, state);
      expect(l.rootStyles, state).toEqual(['solid', 'solid', 'solid', 'solid']);
      expect(l.dayBackground, state).toBe(fills[state]);
      expect(l.opacity, state).toBe(state === 'disabled' ? 0.5 : 1);
    }
    expect((await calendarLook(page, 'invalid')).rootColor).toBe(t.error);
    // Invalid with nothing selected: only the frame is red.
    const empty = await calendarLook(page, 'invalid-empty');
    expect(empty.rootColor).toBe(t.error);
    expect(empty.dayBackground).toBeNull();
  });

  test('forced / locked: dashed frame on the read-only surface, an outlined neutral selected day, no primary', async ({ page }) => {
    const t = await tokens(page);
    for (const state of BLOCKED) {
      const l = await calendarLook(page, state);
      expect(l.rootStyles, state).toEqual(['dashed', 'dashed', 'dashed', 'dashed']);
      expect(l.rootBackground, state).toBe(t.readonlySurface);
      expect(l.dayBackground, state).toBe('rgba(0, 0, 0, 0)');
      expect(l.dayBorder, state).toBe(t.readonlyIndicator);
      expect(l.dayColor, state).toBe(t.text);
      expect(l.opacity, state).toBe(1);
      expect([l.dayBackground, l.dayBorder, l.dayColor], state).not.toContain(t.primary);
    }
    expect((await calendarLook(page, 'locked-invalid')).rootColor).toBe(t.error);
    expect((await calendarLook(page, 'locked')).rootColor).not.toBe(t.error);
  });

  test('forced and locked are identical; every state has the same size', async ({ page }) => {
    expect(await calendarLook(page, 'forced')).toEqual(await calendarLook(page, 'locked'));
    const reference = await calendarLook(page, 'default');
    for (const state of [...STATES, 'invalid-empty']) {
      const l = await calendarLook(page, state);
      expect(l.height, state).toBe(reference.height);
      expect(l.width, state).toBe(reference.width);
    }
  });

  test('hovering a day of a forced / locked calendar changes nothing', async ({ page }) => {
    for (const state of BLOCKED) {
      const target = cell(page, 'calendar', state).getByRole('gridcell', { name: 'Wednesday, March 18, 2026' });
      const read = () => target.locator('span').evaluate((el) => getComputedStyle(el).backgroundColor);
      await page.mouse.move(0, 0);
      const before = await read();
      await target.hover();
      expect(await read(), state).toBe(before);
    }
  });
});
