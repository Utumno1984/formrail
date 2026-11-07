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

/**
 * Returns, per theme group, the names as they appear in utilities after the prefix
 * (e.g. the modal z-index token is listed as `rop-modal`).
 */
export function parseTokenScale(css: string): TokenScale {
  const scale: TokenScale = { color: [], text: [], font: [], radius: [], 'z-index': [] };
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(TOKEN_RE)) {
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
 */
export function parseDerivedTokens(css: string): Map<string, string> {
  const block = /@theme\s+reference\s*\{([^{}]*)\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1];
  if (block === undefined) throw new Error('parseDerivedTokens: no @theme reference block in tokens.css');
  return new Map([...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1] as string, m[2] as string]));
}
