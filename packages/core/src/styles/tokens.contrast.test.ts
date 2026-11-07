import tokensCss from './tokens.css?raw';

// Resolves a token from the real tokens.css (hex, var(), color-mix in srgb, white/black), so the
// contrast checks follow the shipped values instead of numbers copied by hand.
type Rgb = [number, number, number];

const declarations = new Map<string, string>();
for (const m of tokensCss.matchAll(/(--[\w-]+):\s*([^;]+);/g)) declarations.set(m[1]!, m[2]!.trim());

function resolve(value: string): Rgb {
  const v = value.trim();
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)) as Rgb;
  if (v === 'white') return [255, 255, 255];
  if (v === 'black') return [0, 0, 0];
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) return resolve(declarations.get(ref[1]!) ?? fail(`missing token ${ref[1]}`));
  // A derived token is `var(--own-name, <default>)`: an override slot left unset, so its colour is the default.
  const slot = v.match(/^var\((--[\w-]+),\s*(.+)\)$/);
  if (slot) return resolve(slot[2]!);
  const mix = v.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)$/);
  if (mix) {
    const p = Number(mix[2]) / 100;
    const a = resolve(mix[1]!);
    const b = resolve(mix[3]!);
    return a.map((c, i) => c * p + b[i]! * (1 - p)) as Rgb;
  }
  return fail(`unsupported color expression: ${v}`);
}

function fail(message: string): never {
  throw new Error(message);
}

const token = (name: string): Rgb => resolve(declarations.get(`--color-rop-${name}`) ?? fail(`missing ${name}`));

const luminance = ([r, g, b]: Rgb) => {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe('primary scale tokens', () => {
  it('blue-600 is the only hardcoded step; every other one is a color-mix of it', () => {
    const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800];
    const hardcoded = steps.filter((s) => /#[0-9a-f]{3,8}\b/i.test(declarations.get(`--color-rop-blue-${s}`) ?? ''));
    expect(hardcoded).toEqual([600]);
    for (const s of [50, 100, 200, 300, 400, 500]) {
      expect(declarations.get(`--color-rop-blue-${s}`)).toMatch(/^color-mix\(in srgb, var\(--color-rop-blue-600\) \d+%, white\)$/);
    }
    for (const s of [700, 800]) {
      expect(declarations.get(`--color-rop-blue-${s}`)).toMatch(/^color-mix\(in srgb, var\(--color-rop-blue-600\) \d+%, black\)$/);
    }
  });

  it('primary / hover / active resolve to blue-600 / 700 / 800', () => {
    expect(token('primary')).toEqual(token('blue-600'));
    expect(token('primary-hover')).toEqual(token('blue-700'));
    expect(token('primary-active')).toEqual(token('blue-800'));
  });

  it('the scale gets monotonically darker from 50 to 800', () => {
    const lum = [50, 100, 200, 300, 400, 500, 600, 700, 800].map((s) => luminance(token(`blue-${s}`)));
    for (let i = 1; i < lum.length; i += 1) expect(lum[i]!).toBeLessThan(lum[i - 1]!);
  });
});

describe('contrast', () => {
  const white = token('primary-contrast');

  it.each(['blue-600', 'blue-700', 'blue-800'])('white text on %s is at least 4.5:1 (WCAG AA)', (name) => {
    expect(contrast(token(name), white)).toBeGreaterThanOrEqual(4.5);
  });

  // Pressed states (#196): the text that sits on the pressed backgrounds.
  it.each(['error-hover', 'error-active'])('white text on %s is at least 4.5:1 (WCAG AA)', (name) => {
    expect(contrast(token(name), white)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['text', 'text-muted', 'primary-active'])('%s text on the pressed surface is at least 4.5:1 (WCAG AA)', (name) => {
    expect(contrast(token(name), token('surface-pressed'))).toBeGreaterThanOrEqual(4.5);
  });

  it('the pressed surface is darker than the hover surface, which is darker than the surface', () => {
    expect(luminance(token('surface-pressed'))).toBeLessThan(luminance(token('surface-subtle')));
    expect(luminance(token('surface-subtle'))).toBeLessThan(luminance(token('surface')));
    expect(luminance(token('error-active'))).toBeLessThan(luminance(token('error-hover')));
  });

  it.each(['surface', 'surface-subtle'])('the focus ring (blue-600) on %s is at least 3:1 (WCAG 1.4.11)', (name) => {
    expect(contrast(token('blue-600'), token(name))).toBeGreaterThanOrEqual(3);
  });

  // StatusBadge: the dark text token on each tone's background. The tinted tones are the tone token
  // at 10% opacity over the white surface (`bg-rop-<tone>/10`), mixed here in srgb; neutral is the
  // subtle surface. Both are computed from the real tokens.
  const over = (name: string, alpha: number): Rgb =>
    token(name).map((c, i) => c * alpha + token('surface')[i]! * (1 - alpha)) as Rgb;
  const badgeBackgrounds: Record<string, Rgb> = {
    neutral: token('surface-subtle'),
    info: over('info', 0.1),
    success: over('success', 0.1),
    warning: over('warning', 0.1),
    error: over('error', 0.1),
  };
  it.each(Object.keys(badgeBackgrounds))('StatusBadge %s: text on its background is at least 4.5:1 (WCAG AA)', (tone) => {
    expect(contrast(token('text'), badgeBackgrounds[tone]!)).toBeGreaterThanOrEqual(4.5);
  });

  // Avatar: initials (text) and generic icon (text-muted) on the subtle surface; the outline
  // (border) is a non-text contour, not subject to the text threshold.
  it.each(['text', 'text-muted'])('Avatar: %s on the subtle surface is at least 4.5:1 (WCAG AA)', (name) => {
    expect(contrast(token(name), token('surface-subtle'))).toBeGreaterThanOrEqual(4.5);
  });

  // ProgressBar: the fill tones against the track (non-text component, WCAG 1.4.11).
  it.each(['primary', 'success', 'error'])('ProgressBar %s fill on the track is at least 3:1 (WCAG 1.4.11)', (tone) => {
    expect(contrast(token(tone), token('border-subtle'))).toBeGreaterThanOrEqual(3);
  });

  // Control outlines (Input, Select, Combobox, secondary Button), WCAG 1.4.11.
  it.each(['surface', 'surface-subtle'])('control outline (border) on %s is at least 3:1 (WCAG 1.4.11)', (name) => {
    expect(contrast(token('border'), token(name))).toBeGreaterThanOrEqual(3);
  });

  it('the soft neutral (border-subtle) stays lighter than the control outline', () => {
    expect(luminance(token('border-subtle'))).toBeGreaterThan(luminance(token('border')));
  });

  // Checkbox: the box border (text-muted) on the surface and the white mark on the filled box, WCAG 1.4.11.
  it.each(['surface', 'surface-subtle'])('Checkbox: the box border (text-muted) on %s is at least 3:1 (WCAG 1.4.11)', (name) => {
    expect(contrast(token('text-muted'), token(name))).toBeGreaterThanOrEqual(3);
  });

  it('Checkbox: the white mark on the filled (primary) box is at least 3:1', () => {
    expect(contrast(token('primary'), token('primary-contrast'))).toBeGreaterThanOrEqual(3);
  });

  // RadioGroup: the circle border (text-muted) on the surface and the selected border/dot (primary), WCAG 1.4.11.
  it.each(['surface', 'surface-subtle'])('RadioGroup: the circle border (text-muted) on %s is at least 3:1 (WCAG 1.4.11)', (name) => {
    expect(contrast(token('text-muted'), token(name))).toBeGreaterThanOrEqual(3);
  });

  it('RadioGroup: the selected dot and border (primary) on the surface are at least 3:1', () => {
    expect(contrast(token('primary'), token('surface'))).toBeGreaterThanOrEqual(3);
  });

  it('RadioGroup: the invalid border (error) on the surface is at least 3:1', () => {
    expect(contrast(token('error'), token('surface'))).toBeGreaterThanOrEqual(3);
  });

  // Switch: off = text-muted border and thumb on the surface; on = primary track with a primary-contrast thumb.
  it.each(['surface', 'surface-subtle'])('Switch: the off track border and thumb (text-muted) on %s are at least 3:1 (WCAG 1.4.11)', (name) => {
    expect(contrast(token('text-muted'), token(name))).toBeGreaterThanOrEqual(3);
  });

  it.each(['surface', 'surface-subtle'])('Switch: the on track (primary) on %s is at least 3:1', (name) => {
    expect(contrast(token('primary'), token(name))).toBeGreaterThanOrEqual(3);
  });

  it('Switch: the on thumb (primary-contrast) on the on track (primary) is at least 3:1', () => {
    expect(contrast(token('primary'), token('primary-contrast'))).toBeGreaterThanOrEqual(3);
  });

  // Forced / locked controls (#223): the neutral "on" indicator and the dashed border on the plain
  // and the read-only surfaces (WCAG 1.4.11), the text inside a read-only field (1.4.3).
  it.each(['surface', 'readonly-surface'])('forced/locked: the indicator (readonly-indicator) on %s is at least 3:1 (WCAG 1.4.11)', (name) => {
    expect(contrast(token('readonly-indicator'), token(name))).toBeGreaterThanOrEqual(3);
  });

  it('forced/locked + invalid: the error border on the read-only surface is at least 3:1 (WCAG 1.4.11)', () => {
    expect(contrast(token('error'), token('readonly-surface'))).toBeGreaterThanOrEqual(3);
  });

  it('forced/locked: the text on the read-only surface is at least 4.5:1 (WCAG AA)', () => {
    expect(contrast(token('text'), token('readonly-surface'))).toBeGreaterThanOrEqual(4.5);
  });

  // Invalid (#223): the tick / dash / thumb (primary-contrast) on the error fill of a Checkbox, a
  // Switch and a selected Calendar day; the same at hover and pressed.
  it.each(['error', 'error-hover', 'error-active'])('invalid: primary-contrast on the %s fill is at least 4.5:1', (name) => {
    expect(contrast(token(name), token('primary-contrast'))).toBeGreaterThanOrEqual(4.5);
  });

  it('the read-only tokens are aliases of the neutral scale, not new colours', () => {
    expect(declarations.get('--color-rop-readonly-surface')).toBe('var(--color-rop-readonly-surface, var(--color-rop-surface-subtle))');
    expect(declarations.get('--color-rop-readonly-indicator')).toBe('var(--color-rop-readonly-indicator, var(--color-rop-text-muted))');
  });

  it('the focus ring is drawn with the primary token', () => {
    expect(token('primary')).toEqual(token('blue-600'));
  });
});
