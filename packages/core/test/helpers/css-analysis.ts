/** Minimal CSS analysis helpers for the tests on the compiled stylesheet. */

export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

export interface CssBlock {
  /** Selector or at-rule prelude, e.g. `.px-2`, `@layer utilities`. */
  prelude: string;
  /** Raw text between the braces; empty for statements without a block. */
  body: string;
  /** True for `@layer a, b;`-like statements. */
  statement: boolean;
}

/** Splits a stylesheet (or a block body) into its direct children, honouring nesting. */
export function topLevel(css: string): CssBlock[] {
  const source = stripComments(css);
  const blocks: CssBlock[] = [];
  let depth = 0;
  let start = 0;
  let bodyStart = -1;
  let prelude = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') {
      if (depth === 0) {
        prelude = source.slice(start, i).trim();
        bodyStart = i + 1;
      }
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        blocks.push({ prelude, body: source.slice(bodyStart, i), statement: false });
        start = i + 1;
      }
    } else if (ch === ';' && depth === 0) {
      const text = source.slice(start, i).trim();
      if (text) blocks.push({ prelude: text, body: '', statement: true });
      start = i + 1;
    }
  }
  return blocks;
}

/** Every rule selector (nested ones included), at-rule preludes excluded. */
function selectorsIn(blocks: CssBlock[]): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  for (const block of blocks) {
    if (block.statement) continue;
    // The frames of a `rop-` keyframes (`from`, `to`, `50%`) are not selectors.
    if (isRopKeyframes(block.prelude)) continue;
    if (block.prelude.startsWith('@')) {
      out.push(...selectorsIn(topLevel(block.body)));
    } else {
      out.push({ selector: block.prelude, body: block.body });
      out.push(...selectorsIn(topLevel(block.body)));
    }
  }
  return out;
}

/**
 * `@keyframes rop-*`: a keyframes rule cannot live inside `@layer` (Tailwind emits it at the top
 * level), so the only guarantee is the namespace: a name that cannot collide with the host's.
 */
export function isRopKeyframes(prelude: string): boolean {
  return /^@keyframes\s+rop-[a-z0-9-]+$/.test(prelude);
}

function declaresOnlyTailwindInternals(body: string): boolean {
  const decls = body
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean);
  return decls.length > 0 && decls.every((d) => d.startsWith('--tw-'));
}

/**
 * Returns the reasons why a compiled stylesheet is not "safe to import in somebody else's app":
 * preflight/reset leftovers, global element selectors, rules outside `@layer`.
 * Allowed: `:root, :host` blocks that only declare custom properties (the tokens), `@property`
 * registrations, and `@layer` ordering statements.
 */
export function findGlobalLeaks(css: string): string[] {
  const problems: string[] = [];
  const clean = stripComments(css);
  if (/box-sizing:\s*border-box/.test(clean)) problems.push('preflight: box-sizing reset');

  for (const block of topLevel(css)) {
    if (block.statement) {
      if (!block.prelude.startsWith('@layer')) problems.push(`top-level statement: ${block.prelude}`);
      continue;
    }
    const prelude = block.prelude;
    if (prelude.startsWith('@layer')) continue;
    // `@property --tw-*` registrations are inert Tailwind internals (see below), not a reset.
    if (/^@property\s+--tw-/.test(prelude)) continue;
    if (isRopKeyframes(prelude)) continue;
    problems.push(`rule outside @layer: ${prelude}`);
  }

  for (const { selector, body } of selectorsIn(topLevel(css))) {
    // An escaped comma (`\,`, from an arbitrary-value class such as `grid-cols-[minmax(0,1fr)]`)
    // belongs to the class name, it does not separate two selectors.
    const parts = selector.split(/(?<!\\),/).map((s) => s.trim());
    // Tailwind v4 emits `*, ::before, ::after, ::backdrop { --tw-...: ...; }` (inside
    // `@layer properties`) as soon as shadow-/ring-/translate-/leading- utilities are used. Those
    // are inert internal custom properties, not a reset: allowed ONLY when the block declares
    // nothing but `--tw-*` custom properties and every selector is one of the four below.
    const tailwindInternals = ['*', '::before', '::after', '::backdrop'];
    if (parts.every((p) => tailwindInternals.includes(p)) && declaresOnlyTailwindInternals(body)) continue;
    for (const part of parts) {
      if (part === ':root' || part === ':host') {
        // Tailwind wraps a token whose value is a `color-mix(... var(--x) ...)` in a nested
        // `@supports (...) { --token: ... }` fallback: unwrap it, what is inside is still checked.
        const decls = body
          .replace(/@supports[^{}]*\{([^{}]*)\}/g, '$1;')
          .split(';')
          .map((d) => d.trim())
          .filter(Boolean);
        if (!decls.every((d) => d.startsWith('--'))) {
          problems.push(`${part} declares something other than custom properties`);
        }
        continue;
      }
      if (part.startsWith('.') || part.startsWith('&')) continue;
      problems.push(`global selector: ${part}`);
    }
  }
  return problems;
}

/** Declared custom properties (name -> value) of a CSS text. */
export function customProperties(css: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const match of stripComments(css).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)[;}]/gi)) {
    vars.set(match[1] as string, (match[2] as string).trim());
  }
  return vars;
}
