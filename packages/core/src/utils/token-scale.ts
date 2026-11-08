/**
 * Reads the token names out of the CSS source (`src/styles/tokens.css`), the single source of
 * truth, so that nothing (cn() included) keeps a hand-written copy of the list that could drift.
 */
export type TokenGroup = 'color' | 'text' | 'font' | 'radius' | 'z-index';

export type TokenScale = Record<TokenGroup, string[]>;

// `--<group>-rop-<name>:`, anchored to the `rop` namespace so that e.g. a future
// `--font-weight-rop-semibold` is not read as a font family. Companion variables such as
// `--text-rop-body--line-height` are not tokens of their own and are skipped.
const TOKEN_RE = /--(color|text|font|radius|z-index)-(rop)-([a-z0-9-]+)\s*:/g;

/** The CSS source without its comments. */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Returns, per theme group, the names as they appear in utilities after the prefix
 * (e.g. the modal z-index token is listed as `rop-modal`).
 */
export function parseTokenScale(css: string): TokenScale {
  const scale: TokenScale = { color: [], text: [], font: [], radius: [], 'z-index': [] };
  for (const match of stripComments(css).matchAll(TOKEN_RE)) {
    const [, group, namespace, name] = match as unknown as [string, TokenGroup, string, string];
    if (name.includes('--')) continue;
    const key = `${namespace}-${name}`;
    if (!scale[group].includes(key)) scale[group].push(key);
  }
  return scale;
}

/**
 * The derived color tokens of the `@theme reference` block, as declared (variable name -> formula).
 * Stories and tests only: `cn()` does not need it, so it never reaches the bundle.
 *
 * Throws unless the source has exactly one `@theme reference` block (whatever other options it
 * carries) and that block holds plain declarations only: a nested at-rule or rule (`@media`,
 * `@supports`, ...) would end the block at its first `}` and drop the declarations after it.
 */
export function parseDerivedTokens(css: string): Map<string, string> {
  const source = stripComments(css);
  const opens = [...source.matchAll(/@theme\b([^{;]*)\{/g)].filter((m) => /(^|\s)reference(\s|$)/.test(m[1] as string));
  if (opens.length === 0) throw new Error('parseDerivedTokens: no @theme reference block in tokens.css');
  if (opens.length > 1) throw new Error(`parseDerivedTokens: ${opens.length} @theme reference blocks in tokens.css, expected one`);
  const [open] = opens as [RegExpExecArray];
  const start = open.index + open[0].length;
  const end = source.indexOf('}', start);
  if (end === -1) throw new Error('parseDerivedTokens: the @theme reference block is not closed');
  const block = source.slice(start, end);
  if (block.includes('{')) {
    throw new Error('parseDerivedTokens: the @theme reference block holds a nested rule or at-rule; only declarations are supported');
  }
  return new Map([...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1] as string, m[2] as string]));
}

/**
 * The color names of `parseTokenScale(css).color`, with each derived token moved right after the
 * color its formula is computed from (the first `var(--color-…)` of the formula). Derived tokens of
 * the same base keep their declaration order; a derived token computed from another derived one
 * goes after it. Every other color keeps the file's order.
 *
 * Throws if a derived token is not in the color list, or if its formula does not reference a color
 * of that list (no `var(--color-…)`, an unknown one, or a cycle among derived tokens).
 */
export function paletteOrder(css: string): string[] {
  const colors = parseTokenScale(css).color;
  const derived = parseDerivedTokens(css);
  const byBase = new Map<string, string[]>();
  const derivedNames = new Set<string>();
  for (const [token, formula] of derived) {
    const name = token.replace(/^--color-/, '');
    if (!token.startsWith('--color-') || !colors.includes(name)) {
      throw new Error(`paletteOrder: derived token ${token} is not a color token of tokens.css`);
    }
    const base = /var\(\s*--color-([a-z0-9-]+)/.exec(formula)?.[1];
    if (base === undefined || base === name || !colors.includes(base)) {
      throw new Error(`paletteOrder: the formula of ${token} (${formula}) references no other color token of tokens.css`);
    }
    derivedNames.add(name);
    byBase.set(base, [...(byBase.get(base) ?? []), name]);
  }
  const order: string[] = [];
  const place = (name: string): void => {
    order.push(name);
    for (const next of byBase.get(name) ?? []) place(next);
  };
  for (const name of colors) if (!derivedNames.has(name)) place(name);
  if (order.length !== colors.length) {
    const missing = colors.filter((name) => !order.includes(name));
    throw new Error(`paletteOrder: ${missing.join(', ')} derive from each other in a cycle`);
  }
  return order;
}
