// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { edgeLayerClass, edgeShadowEndClass, edgeShadowStartClass } from '../src/list-report/list-report-table-styles';
import { topLevel } from './helpers/css-analysis';

// #562: the List Report's edge shades in a browser without `color-mix()` (Safari 16.0 and 16.1). The
// colour is a custom property holding `color-mix(...)`: such a browser keeps the declaration (a custom
// property is not validated) and the gradient that reads it is invalid at computed-value time, so no
// shade is drawn. A fallback declared "before" in the same rule would lose to it; the fallback is an
// `@supports not` block instead, read here in the compiled CSS.

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stylesCss = readFileSync(join(packageDir, 'dist/styles.css'), 'utf8');

interface Declaration {
  /** The rule's selector, unescaped (`.a\:b` -> `.a:b`), as a class list in the sources reads. */
  selector: string;
  /** Enclosing `@supports` preludes, outermost first. */
  supports: string[];
  property: string;
  value: string;
  /** Position in the stylesheet: a later declaration of the same specificity wins. */
  order: number;
}

/** Every declaration of the stylesheet, with its rule (nested `@supports` included) and its order. */
function declarations(css: string): Declaration[] {
  const out: Declaration[] = [];
  const walk = (source: string, selector: string, supports: string[]) => {
    const blocks = topLevel(source);
    for (const block of blocks) {
      if (block.statement) {
        // Inside a rule, a "statement" is a declaration (`property: value`).
        const colon = block.prelude.indexOf(':');
        if (selector && colon > 0) {
          out.push({
            selector,
            supports,
            property: block.prelude.slice(0, colon).trim(),
            value: block.prelude.slice(colon + 1).trim(),
            order: out.length,
          });
        }
        continue;
      }
      if (block.prelude.startsWith('@supports')) walk(block.body, selector, [...supports, block.prelude]);
      else if (block.prelude.startsWith('@')) walk(block.body, selector, supports);
      else walk(block.body, block.prelude.replace(/\\/g, ''), supports);
    }
  };
  walk(css, '', []);
  return out;
}

const NOT_COLOR_MIX = /^@supports not \(color:\s*color-mix\(/;
const all = declarations(stylesCss);
const edgeColour = all.filter((d) => d.property === '--rop-list-report-edge-color');
const fallbackClass = (classes: string) => classes.split(' ').find((c) => c.startsWith('not-supports-'));

describe('List Report edge shades: the colour without color-mix() (compiled styles.css, #562)', () => {
  it('the layer has the fallback colour, the text colour itself, in an @supports not (color-mix) block after the color-mix one', () => {
    const cls = fallbackClass(edgeLayerClass);
    expect(cls).toBe('not-supports-[color:color-mix(in_srgb,red,blue)]:[--rop-list-report-edge-color:var(--color-rop-text)]');
    const fallback = edgeColour.filter((d) => d.selector === `.${cls}`);
    expect(fallback).toEqual([expect.objectContaining({ value: 'var(--color-rop-text)', supports: [expect.stringMatching(NOT_COLOR_MIX)] })]);
    // The color-mix colour, on the layer's other class, with no `@supports not` around it.
    const base = edgeColour.filter((d) => d.selector !== `.${cls}`);
    expect(base.length).toBeGreaterThan(0);
    for (const d of base) {
      expect(d.value).toMatch(/^color-mix\(in srgb,\s*(?:var\(--color-rop-text\)|#[0-9a-f]+) 24%,\s*transparent\)$/);
      expect(d.supports.some((s) => NOT_COLOR_MIX.test(s))).toBe(false);
      expect(edgeLayerClass.split(' ')).toContain(d.selector.slice(1));
      // Same specificity (one class): the fallback must come later to win where it applies.
      expect(fallback[0]!.order).toBeGreaterThan(d.order);
    }
  });

  it('each shade puts its ::before at 24% opacity in the same block: the same alpha over the same gradient', () => {
    for (const classes of [edgeShadowStartClass, edgeShadowEndClass]) {
      const cls = fallbackClass(classes);
      expect(cls).toBe('not-supports-[color:color-mix(in_srgb,red,blue)]:before:opacity-24');
      const rule = all.filter((d) => d.selector === `.${cls}::before` && d.property === 'opacity');
      expect(rule).toEqual([expect.objectContaining({ value: '24%', supports: [expect.stringMatching(NOT_COLOR_MIX)] })]);
      // The gradient reads the same custom property in both cases.
      expect(classes).toContain('before:bg-[linear-gradient(to_right,transparent,var(--rop-list-report-edge-color),transparent)]');
    }
  });

  it('where color-mix() is supported nothing changes: every fallback declaration is inside @supports not (color-mix)', () => {
    const fallbackDeclarations = all.filter((d) => d.selector.includes('not-supports-['));
    expect(fallbackDeclarations.length).toBeGreaterThan(0);
    for (const d of fallbackDeclarations) expect(d.supports).toEqual([expect.stringMatching(NOT_COLOR_MIX)]);
    // And the text colour as such is the edge colour nowhere else.
    for (const d of edgeColour.filter((e) => e.value === 'var(--color-rop-text)')) expect(d.supports.some((s) => NOT_COLOR_MIX.test(s))).toBe(true);
  });
});
