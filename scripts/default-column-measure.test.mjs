import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { PROSE_DEFAULT, REPO_ROOT, causeOf, destructuringDefaults, findComponentFunction, isLiteralInitializer, measure } from './default-column-measure.mjs';

// Tests of the measure for the empty Default column (ticket #460). The helpers are pure and tested on
// snippets; `measure` runs the real docgen on small fixture packages (one case per file) and on the repo.
//
// No versioned baseline on purpose: the numbers are an ANALYSIS (the ticket decides between fixing the docgen
// and pointing to the type reference), not a quality gate. A baseline would fail every unrelated change of a
// component and be rewritten on every corsa, which is the thing the bundle budget baseline is not allowed
// to be. What is permanent is the contract: the known case (`Button.size`) is found, and each edge case
// of the ticket is classified as documented.

const parse = (code) => ts.createSourceFile('x.tsx', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const firstInit = (code) => parse(`const x = ${code};`).statements[0].declarationList.declarations[0].initializer;

describe('isLiteralInitializer', () => {
  it.each(["'md'", '0', '-1', 'true', 'null', 'undefined', '[]', '[1, "a"]', '{ a: 1 }', '`x`'])('%s is literal', (code) => {
    expect(isLiteralInitializer(firstInit(code))).toBe(true);
  });
  it.each(['DEFAULT_THRESHOLD', 'other.size', 'f()', '() => 1', '{ a: B }', '`a${b}`'])('%s is not literal', (code) => {
    expect(isLiteralInitializer(firstInit(code))).toBe(false);
  });
});

describe('findComponentFunction + destructuringDefaults', () => {
  const defaultsOf = (code, name = 'C') => {
    const sf = parse(code);
    const fn = findComponentFunction(sf, name);
    return fn && destructuringDefaults(fn, sf);
  };
  it('reads the parameter destructuring of a plain function', () => {
    const d = defaultsOf("export function C({ a = 1, b, c: renamed = 'x' }) { return null; }");
    expect([...d.keys()].sort()).toEqual(['a', 'c']);
    expect(d.get('a')).toMatchObject({ text: '1', literal: true, where: 'param' });
  });
  it('reads forwardRef and memo wrappers (not skipped)', () => {
    expect(defaultsOf("export const C = forwardRef(function C({ a = 1 }, ref) { return null; });").get('a').where).toBe('param');
    expect(defaultsOf('export const C = memo(({ a = 1 }) => null);').get('a').where).toBe('param');
    expect(defaultsOf('export const C = /* @__PURE__ */ memo(forwardRef<A, B>(({ a = 1 }, ref) => null));').get('a').where).toBe('param');
  });
  it('reads `const { ... } = props` in the body and marks it as such', () => {
    const d = defaultsOf("export const C = forwardRef((props, ref) => { const { a = 'x', ...rest } = props; return null; });");
    expect(d.get('a')).toMatchObject({ text: "'x'", where: 'body' });
  });
  it('a default that depends on something else is not a literal', () => {
    expect(defaultsOf('export function C({ a = LIMIT, b = 2 }) { return null; }').get('a').literal).toBe(false);
  });
  it('returns nothing for a name that is not in the file', () => {
    expect(defaultsOf('export const D = () => null;')).toBeUndefined();
  });
});

describe('PROSE_DEFAULT', () => {
  it.each(['Default `secondary`.', 'Defaults to `true`.', 'default: `md`'])('matches %s', (text) => expect(PROSE_DEFAULT.test(text)).toBe(true));
  it.each(['The default theme is dark.', 'No default here', 'defaultValue prop'])('does not match %s', (text) => expect(PROSE_DEFAULT.test(text)).toBe(false));
});

describe('causeOf', () => {
  it('prioritises body destructuring, then alias, then non-literal', () => {
    const sf = {};
    expect(causeOf({ where: 'body', literal: false }, { getSourceFile: () => ({}) }, sf, 'a')).toBe('body-destructuring');
    expect(causeOf({ where: 'param', literal: true }, { getSourceFile: () => ({}) }, sf, 'a')).toBe('alias');
    expect(causeOf({ where: 'param', literal: false }, { getSourceFile: () => sf }, sf, 'a')).toBe('non-literal');
    expect(causeOf({ where: 'param', literal: true }, { getSourceFile: () => sf }, sf, 'a')).toBe('other');
  });
});

describe('measure on fixture packages (the real docgen, one case per component)', () => {
  const root = mkdtempSync(join(tmpdir(), 'formrail-measure-'));
  const src = join(root, 'packages/core/src');
  mkdirSync(src, { recursive: true });
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(root, 'node_modules'));
  const files = {
    'ParamDefault.tsx': `export interface P {
        /** x. */
        size?: 'sm' | 'md';
      }
      export function ParamDefault({ size = 'md' }: P) { return <i>{size}</i>; }`,
    'BodyDefault.tsx': `export interface P { /** x. */ size?: 'sm' | 'md'; }
      export function BodyDefault(props: P) { const { size = 'md' } = props; return <i>{size}</i>; }`,
    'UnionParam.tsx': `export type P = {
        /** x. */
        size?: 'sm' | 'md';
      } | {
        /** x. */
        size: 'icon';
        label: string;
      };
      export function UnionParam({ size = 'md' }: P) { return <i>{size}</i>; }`,
    'Wrapped.tsx': `import { forwardRef, memo } from 'react';
      export interface P { /** x. */ size?: 'sm' | 'md'; }
      export const Fwd = forwardRef<HTMLElement, P>(function Fwd({ size = 'md' }, ref) { return <i ref={ref}>{size}</i>; });
      export const Memoed = memo(function Memoed({ size = 'md' }: P) { return <i>{size}</i>; });`,
    'Dependent.tsx': `const LIMIT = 5;
      export interface P { /** x. */ limit?: number; }
      export function Dependent({ limit = LIMIT }: P) { return <i>{limit}</i>; }`,
    'Prose.tsx': `export interface P {
        /** Visual weight. Default \`bold\`. */
        weight?: string;
      }
      export function Prose({ weight }: P) { return <i>{weight ?? 'bold'}</i>; }`,
    'Tagged.tsx': `export interface P {
        /**
         * Visual weight.
         * @default 'bold'
         */
        weight?: string;
      }
      export function Tagged({ weight }: P) { return <i>{weight}</i>; }`,
  };
  const index = Object.keys(files).map((f) => `export * from './${f.replace('.tsx', '')}';`).join('\n');
  writeFileSync(join(src, 'index.ts'), index);
  for (const [name, code] of Object.entries(files)) writeFileSync(join(src, name), code);

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const result = measure({ root, entries: ['packages/core/src/index.ts'] });
  const row = (component, prop) => result.components.find((c) => c.component === component)?.rows.find((r) => r.prop === prop);

  it('keeps a default read from the parameter destructuring', () => {
    expect(row('ParamDefault', 'size')).toMatchObject({ kind: 'ok', where: 'param' });
  });
  it('reports a default destructured in the body as a gap', () => {
    expect(row('BodyDefault', 'size')).toMatchObject({ kind: 'gap', cause: 'body-destructuring', literal: true });
  });
  it('a union of props with a parameter destructuring: reproduces what the union alone does to the column', () => {
    // Pins the observed behaviour so the report states a measured cause, not an assumption.
    expect(row('UnionParam', 'size')).toMatchObject({ kind: 'ok', union: true });
  });
  it('does not skip forwardRef / memo components', () => {
    expect(row('Fwd', 'size')).toMatchObject({ kind: 'ok' });
    expect(row('Memoed', 'size')).toMatchObject({ kind: 'ok' });
  });
  it('flags a default that depends on another value as non-literal', () => {
    const r = row('Dependent', 'limit');
    expect(r.literal).toBe(false);
  });
  it('lists a default that lives only in prose separately', () => {
    expect(row('Prose', 'weight')).toMatchObject({ kind: 'prose-only' });
  });
  it('a @default tag fills the column (not a gap)', () => {
    expect(row('Tagged', 'weight')).toMatchObject({ kind: 'ok', where: 'tag' });
  });
});

describe('measure on the repository', { timeout: 60_000 }, () => {
  const result = measure();
  it('finds the known case: Button.size has a default in the source and an empty column', () => {
    const button = result.components.find((c) => c.component === 'Button');
    expect(button.rows.find((r) => r.prop === 'size')).toMatchObject({ kind: 'gap', source: "'md'" });
  });
  it('covers core and Pro components and every wrapper shape', () => {
    const files = result.components.map((c) => c.file);
    expect(files.some((f) => f.startsWith('packages/core/'))).toBe(true);
    expect(files.some((f) => f.startsWith('packages/pro/'))).toBe(true);
    expect(result.components.find((c) => c.component === 'Select')?.shape).toBe('wrapped/arrow');
  });
  it('is deterministic', () => {
    expect(measure()).toEqual(result);
  }, 60_000);
});
