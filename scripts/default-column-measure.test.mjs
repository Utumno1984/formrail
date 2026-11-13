import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { PROSE_DEFAULT, REPO_ROOT, UNCOMPARABLE_ALLOWLIST, causeOf, check, destructuringDefaults, findComponentFunction, formatCheck, isLiteralInitializer, literalNodeOf, measure, normalizeDefault } from './default-column-measure.mjs';

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
  it('reads the body destructuring through as / satisfies / parentheses / non-null on the initializer', () => {
    for (const init of ['props as Omit<P, "x"> & { y: 1 }', '(props)', 'props satisfies P', 'props!']) {
      const d = defaultsOf(`export const C = forwardRef((props, ref) => { const { a = 1 } = ${init}; return null; });`);
      expect(d.get('a'), init).toMatchObject({ text: '1', where: 'body' });
    }
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
    'CastBody.tsx': `export interface P {
        /** x. */
        open?: boolean;
      }
      export function CastBody(props: P) {
        const { open = true } = props as P & { extra?: string };
        return <i>{String(open)}</i>;
      }`,
    'Inner.tsx': `export interface InnerProps {
        /** x. */
        side?: 'top' | 'bottom';
        /** x. */
        gap?: number;
        /** x. Default \`3\`. */
        count?: number;
      }
      export function Inner({ side = 'top', gap = 4, count = 3 }: InnerProps) { return <i>{side}{gap}{count}</i>; }
      export function InnerFn({ side = 'top' }: InnerProps) { return <i>{side}</i>; }
      export function Other({ label = 'x' }: { label?: string }) { return <i>{label}</i>; }
      export const Opaque = makeThing();
      declare function makeThing(): (props: InnerProps) => null;`,
    'Spread.tsx': `import { Inner } from './Inner';
      import type { InnerProps } from './Inner';
      export function Spread(props: InnerProps) { return <Inner {...props} />; }`,
    'Named.tsx': `import { Inner } from './Inner';
      import type { InnerProps } from './Inner';
      export function Named({ side, gap }: InnerProps) { return <Inner side={side} gap={gap} />; }`,
    'Called.tsx': `import { InnerFn } from './Inner';
      import type { InnerProps } from './Inner';
      export function Called(props: InnerProps) { return InnerFn(props); }`,
    'Unrelated.tsx': `import { Other } from './Inner';
      import type { InnerProps } from './Inner';
      export function Unrelated({ side }: InnerProps) { return <Other label="fixed" data-side={side} />; }`,
    'Unresolved.tsx': `import { Opaque } from './Inner';
      import type { InnerProps } from './Inner';
      export function Unresolved(props: InnerProps) { return <Opaque {...props} />; }`,
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
  it('a body destructuring through a cast is found (Accordion.collapsible)', () => {
    expect(row('CastBody', 'open')).toMatchObject({ kind: 'gap', cause: 'body-destructuring' });
  });
  it('follows <Inner {...props} /> to the default of the internal component', () => {
    expect(row('Spread', 'side')).toMatchObject({ kind: 'gap', cause: 'delegated', via: 'Inner', source: "'top'" });
    expect(row('Spread', 'gap')).toMatchObject({ kind: 'gap', cause: 'delegated' });
  });
  it('a default only in prose that the internal component really has is delegated, not prose-only', () => {
    expect(row('Spread', 'count')).toMatchObject({ kind: 'gap', cause: 'delegated', source: '3' });
  });
  it('follows props passed one by one with the same name, and only those', () => {
    expect(row('Named', 'side')).toMatchObject({ kind: 'gap', cause: 'delegated' });
    expect(row('Named', 'gap')).toMatchObject({ kind: 'gap', cause: 'delegated' });
    expect(row('Named', 'count')).toMatchObject({ kind: 'prose-only' });
  });
  it('follows `return Inner(props)`', () => {
    expect(row('Called', 'side')).toMatchObject({ kind: 'gap', cause: 'delegated', via: 'InnerFn' });
  });
  it('does not call delegated a child that gets other values', () => {
    expect(row('Unrelated', 'side')).toBeUndefined();
  });
  it('lists a delegation it cannot follow instead of staying silent', () => {
    const c = result.components.find((x) => x.component === 'Unresolved');
    expect(c.unresolvedDelegations).toEqual(['Opaque']);
    expect(result.summary.unresolvedDelegations).toContain('Unresolved -> Opaque');
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
  it('finds the known false negative and the known delegations', () => {
    const rowOf = (component, prop) => result.components.find((c) => c.component === component)?.rows.find((r) => r.prop === prop);
    expect(rowOf('Accordion', 'collapsible')).toMatchObject({ kind: 'gap', cause: 'body-destructuring' });
    expect(rowOf('Tooltip', 'side')).toMatchObject({ kind: 'gap', cause: 'delegated', via: 'TooltipInternal' });
    expect(rowOf('ConfirmDialog', 'tone')).toMatchObject({ kind: 'gap', cause: 'delegated', via: 'ConfirmDialogBase' });
    expect(rowOf('Dialog', 'defaultOpen')).toMatchObject({ kind: 'gap', cause: 'delegated', via: 'ModalRoot' });
    expect(rowOf('ListReport', 'titleLevel')).toMatchObject({ kind: 'gap', cause: 'delegated', via: 'ListReportFrame' });
    expect(rowOf('ListReportTable', 'status')).toMatchObject({ kind: 'gap', cause: 'delegated', via: 'ListReportTableShell' });
  });
  it('is deterministic', () => {
    expect(measure()).toEqual(result);
  }, 60_000);
});

// ---------------------------------------------------------------------------------------------------------
// Ticket #474: the measure becomes a guard (`--check`), follows nested / render-prop / hook delegations and
// compares `@default` with the default written in the source. Same method as above: real docgen on fixture
// packages, one component per case.

/** A throw-away package tree (core + an empty pro) with the given component files; returns its root. */
const fixtureRoot = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'formrail-guard-'));
  const core = join(dir, 'packages/core/src');
  mkdirSync(core, { recursive: true });
  mkdirSync(join(dir, 'packages/pro/src'), { recursive: true });
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(dir, 'node_modules'));
  writeFileSync(join(dir, 'packages/pro/src/index.ts'), 'export {};\n');
  const tsx = Object.keys(files).filter((f) => f.endsWith('.tsx'));
  writeFileSync(join(core, 'index.ts'), tsx.map((f) => `export * from './${f.replace('.tsx', '')}';`).join('\n') + '\n');
  for (const [name, code] of Object.entries(files)) writeFileSync(join(core, name), code);
  return dir;
};

const rowIn = (result, component, prop) => result.components.find((c) => c.component === component)?.rows.find((r) => r.prop === prop);
const issuesOf = (issues, component) => issues.filter((i) => i.component === component);

describe('normalizeDefault', () => {
  it.each([
    ["'md'", 'md'], ['"md"', 'md'], ['`md`', 'md'], ['md', 'md'], ['  md  ', 'md'],
    ["''", ''], ['``', ''], ['0', '0'], ['false', 'false'], ['null', 'null'], ['undefined', 'undefined'],
    ["[ 'a',\n 'b' ]", '["a","b"]'], ['{ a: 1 }', '{a:1}'], ['two  words', 'two words'],
  ])('%j -> %j', (input, out) => expect(normalizeDefault(input)).toBe(out));
  it('keeps the empty string, undefined, null, false and 0 all different from each other', () => {
    const values = ["''", 'undefined', 'null', 'false', '0'].map(normalizeDefault);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('literalNodeOf (constants resolved through the checker)', () => {
  const program = (code) => {
    const host = ts.createCompilerHost({});
    const sf = ts.createSourceFile('/x.ts', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const orig = host.getSourceFile.bind(host);
    host.getSourceFile = (name, ...rest) => (name === '/x.ts' ? sf : orig(name, ...rest));
    const p = ts.createProgram(['/x.ts'], { noLib: true }, host);
    return { sf, checker: p.getTypeChecker() };
  };
  const lastInit = (sf) => sf.statements.at(-1).declarationList.declarations[0].initializer;
  it('resolves a const to its literal, through a chain', () => {
    const { sf, checker } = program('const A = 5; const B = A; const target = B;');
    expect(literalNodeOf(lastInit(sf), checker).getText()).toBe('5');
  });
  it('does not resolve a let or a call', () => {
    const l = program('let A = 5; const target = A;');
    expect(literalNodeOf(lastInit(l.sf), l.checker)).toBeUndefined();
    const c = program('declare function f(): number; const A = f(); const target = A;');
    expect(literalNodeOf(lastInit(c.sf), c.checker)).toBeUndefined();
  });
  it('does not loop on a cycle', () => {
    const { sf, checker } = program('const A: number = B; const B: number = A; const target = A;');
    expect(literalNodeOf(lastInit(sf), checker)).toBeUndefined();
  });
});

describe('delegations on fixture packages (#474)', () => {
  const files = {
    'Shared.tsx': `export interface InnerProps {
        /** x. */ side?: 'top' | 'bottom';
        /** x. */ level?: string;
        /** x. */ other?: string;
        /** x. */ gap?: number;
      }
      export function Inner({ side = 'top', other = 'o', gap = 4 }: InnerProps) { return <i>{side}{other}{gap}</i>; }`,
    // Nested: Outer -> Middle -> Deepest (the default lives in the last one).
    'Nested.tsx': `import { Inner } from './Shared';
      import type { InnerProps } from './Shared';
      function Deepest({ level = 'deep' }: InnerProps) { return <i>{level}</i>; }
      function Middle(props: InnerProps) { return <Deepest {...props} />; }
      export function Outer(props: InnerProps) { return <Middle {...props} />; }
      // The nearer default wins: Mid2 defaults level before it reaches Deepest.
      function Mid2({ level = 'mid' }: InnerProps) { return <Deepest level={level} />; }
      export function Outer2(props: InnerProps) { return <Mid2 {...props} />; }
      export function Quiet(props: InnerProps) { return <Inner {...props} />; }`,
    // Two branches reach the same internal component, the first one with only some of the props.
    'Branches.tsx': `import type { InnerProps } from './Shared';
      function Dd({ level = 'dd', side = 'top' }: InnerProps) { return <i>{level}{side}</i>; }
      function Shared2(props: InnerProps) { return <Dd {...props} />; }
      function BranchA({ level }: InnerProps) { return <Shared2 level={level} />; }
      function BranchB(props: InnerProps) { return <Shared2 {...props} />; }
      export function Both(props: InnerProps) { return <><BranchA {...props} /><BranchB {...props} /></>; }`,
    // A callback that is not a render prop (never spreads its parameter): nothing to follow, nothing to report.
    'NotRender.tsx': `import type { InnerProps } from './Shared';
      function Click({ onGo }: { onGo?: (n: number) => void }) { return <button onClick={() => onGo?.(1)} />; }
      export function NotRender({ side }: InnerProps) { return <Click onGo={(n) => void n} data-side={side} />; }`,
    // A spread that is not the props.
    'Unrelated2.tsx': `import { Inner } from './Shared';
      import type { InnerProps } from './Shared';
      export function UnrelatedSpread({ side }: InnerProps) {
        const unrelated = { other: 'x' };
        return <Inner {...unrelated} data-side={side} />;
      }`,
    // Hooks that destructure the defaults.
    'Hooks.tsx': `import type { InnerProps } from './Shared';
      declare function makeHook(): (p: InnerProps) => string;
      export function useGap({ gap = 7 }: InnerProps) { return String(gap); }
      export const useOpaque = makeHook();
      export function HookConst(props: InnerProps) { const v = useGap(props); return <i>{v}</i>; }
      export function HookReturn(props: InnerProps) { return <i>{useGap(props)}</i>; }
      export function HookOpaque(props: InnerProps) { return <i>{useOpaque(props)}</i>; }`,
    // Render prop: Host calls renderBody({ status, count, other: <changed>, id: 'x' }).
    'RenderProp.tsx': `import type { ReactNode } from 'react';
      export interface HostProps {
        /** x. */ status?: 'ready' | 'loading';
        /** x. */ count?: number;
        /** x. */ other?: string;
        /** x. */ renderBody: (p: { status?: 'ready' | 'loading'; count?: number; other?: string; id: string }) => ReactNode;
      }
      export function Host({ renderBody, status, count, other }: HostProps) {
        return <div>{renderBody({ status, count, other: other?.toUpperCase(), id: 'x' })}</div>;
      }
      export function Body({ status = 'ready', count = 2, other = 'o' }: { status?: 'ready' | 'loading'; count?: number; other?: string; id?: string }) {
        return <i>{status}{count}{other}</i>;
      }
      export type PublicProps = Omit<HostProps, 'renderBody'>;
      export function RenderSpread(props: PublicProps) { return <Host {...props} renderBody={(p) => <Body {...p} />} />; }
      export function RenderNamed({ status }: PublicProps) { return <Host status={status} renderBody={(p) => <Body {...p} />} />; }
      export function RenderNoSpread(props: PublicProps) { return <Host {...props} renderBody={(p) => <Body id={p.id} />} />; }
      export function HostOpaque({ render, ...rest }: { render: (p: object) => ReactNode; status?: 'ready' | 'loading' }) { return <div>{render(rest)}</div>; }
      export function RenderOpaque(props: { status?: 'ready' | 'loading' }) { return <HostOpaque {...props} render={(p) => <Body {...p} />} />; }`,
    // A default in the public component and a different one in the internal one.
    'Diverge.tsx': `import { Inner } from './Shared';
      import type { InnerProps } from './Shared';
      export function Diverge(props: InnerProps) { const { side = 'bottom', ...rest } = props; return <Inner side={side} {...rest} />; }
      export function SameValue(props: InnerProps) { const { side = "top", ...rest } = props; return <Inner side={side} {...rest} />; }`,
    // Alias between files.
    'AliasBase.tsx': `export function AliasBase({ tone = 'info' }: { /** x. */ tone?: 'info' | 'warn' }) { return <i>{tone}</i>; }`,
    'Alias.tsx': `import { AliasBase } from './AliasBase';
      export const AliasTitle = AliasBase;`,
    // Unions: the prop is declared in one branch only; default in the parameter and in the body.
    'Unions.tsx': `export type P = { /** x. */ size?: 'sm' | 'md'; label: string } | { icon: string };
      export function UnionParam2({ size = 'md' }: Extract<P, { label: string }>) { return <i>{size}</i>; }
      export function UnionBody(props: P) { const { size = 'md' } = props as Extract<P, { label: string }>; return <i>{size}</i>; }`,
  };
  const root = fixtureRoot(files);
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const result = measure({ root, entries: ['packages/core/src/index.ts'] });
  const row = (c, p) => rowIn(result, c, p);

  it('nested delegation: the default of the last internal component reaches the public prop', () => {
    expect(row('Outer', 'level')).toMatchObject({ kind: 'gap', cause: 'delegated', source: "'deep'", via: 'Middle' });
  });
  it('nested delegation: the nearer default wins over the deeper one', () => {
    expect(row('Outer2', 'level')).toMatchObject({ kind: 'gap', cause: 'delegated', source: "'mid'", via: 'Mid2' });
  });
  it('a component reached by two branches is read for each of them (the first may pass fewer props)', () => {
    expect(row('Both', 'side')).toMatchObject({ kind: 'gap', cause: 'delegated', source: "'top'" });
    expect(row('Both', 'level')).toMatchObject({ kind: 'gap', cause: 'delegated', source: "'dd'" });
  });
  it('a callback that does not spread its parameter is not reported as an unresolved delegation', () => {
    expect(result.components.find((c) => c.component === 'NotRender').unresolvedDelegations).toEqual([]);
  });
  it('a spread of something that is not the props delegates nothing', () => {
    expect(row('UnrelatedSpread', 'other')).toBeUndefined();
    expect(row('UnrelatedSpread', 'side')).toBeUndefined();
  });
  it('a component that passes its props to one with no default for them has no row for those', () => {
    expect(row('Quiet', 'level')).toBeUndefined();
    expect(row('Quiet', 'side')).toMatchObject({ kind: 'gap', cause: 'delegated' });
  });
  it('hooks: `const v = useX(props)` and `return useX(props)` follow the defaults the hook destructures', () => {
    expect(row('HookConst', 'gap')).toMatchObject({ kind: 'gap', cause: 'delegated', via: 'useGap', source: '7' });
    expect(row('HookReturn', 'gap')).toMatchObject({ kind: 'gap', cause: 'delegated', via: 'useGap', source: '7' });
  });
  it('hooks: one the script cannot read is listed in unresolvedDelegations, never silent', () => {
    expect(result.components.find((c) => c.component === 'HookOpaque').unresolvedDelegations).toEqual(['useOpaque']);
  });
  it('render prop: what the host passes unchanged to the callback reaches the child through `{...p}`', () => {
    for (const comp of ['RenderSpread', 'RenderNamed']) expect(row(comp, 'status'), comp).toMatchObject({ kind: 'gap', cause: 'delegated', via: 'Body', source: "'ready'" });
    expect(row('RenderSpread', 'count')).toMatchObject({ kind: 'gap', cause: 'delegated', source: '2' });
  });
  it('render prop: a key the host changes (`other: other?.toUpperCase()`) does not carry the child default', () => {
    expect(row('RenderSpread', 'other')).toBeUndefined();
  });
  it('render prop: only the props the public component hands to the host are delegated', () => {
    expect(row('RenderNamed', 'count')).toBeUndefined();
  });
  it('render prop: a callback that does not spread its parameter delegates nothing', () => {
    expect(row('RenderNoSpread', 'status')).toBeUndefined();
  });
  it('render prop: a host that does not call the prop with an object literal is listed as unresolved', () => {
    expect(result.components.find((c) => c.component === 'RenderOpaque').unresolvedDelegations).toEqual(['HostOpaque.render']);
  });
  it('a default in the public component and another in the internal one: the public wins and the divergence is reported', () => {
    expect(row('Diverge', 'side')).toMatchObject({ source: "'bottom'", divergence: { own: "'bottom'", inner: "'top'", via: 'Inner' } });
  });
  it('the same default written with other quotes is not a divergence', () => {
    expect(row('SameValue', 'side').divergence).toBeUndefined();
  });
  it('an alias between files is classified as alias', () => {
    expect(row('AliasTitle', 'tone')).toMatchObject({ kind: 'gap', cause: 'alias' });
  });
  it('union with the prop in a single branch: default in the parameter is read by the docgen, in the body is a gap', () => {
    expect(row('UnionParam2', 'size')).toMatchObject({ kind: 'ok', where: 'param', union: true });
    expect(row('UnionBody', 'size')).toMatchObject({ kind: 'gap', where: 'body', cause: 'body-destructuring', union: true });
  });
});

describe('check: the guard on fixture packages (#474)', () => {
  const files = {
    'Tags.tsx': `export interface P {
        /** x.
         * @default 'md' */
        ok?: 'sm' | 'md';
        /** x.
         * @default "lg" */
        mismatch?: 'sm' | 'md' | 'lg';
        /** x.
         * @default \`md\` */
        backtick?: 'sm' | 'md';
        /** x.
         * @default md */
        bare?: 'sm' | 'md';
        /** x. */
        missing?: 'sm' | 'md';
        /** Weight. Default \`bold\`. */
        proseOnly?: string;
        /** Redundant. Default \`md\`.
         * @default 'md' */
        redundant?: 'sm' | 'md';
        /** x.
         * @default */
        empty?: string;
      }
      export function Tags(props: P) {
        const { ok = 'md', mismatch = 'md', backtick = 'md', bare = 'md', missing = 'md', redundant = 'md', empty = 'x' } = props;
        return <i>{ok}{mismatch}{backtick}{bare}{missing}{redundant}{empty}{props.proseOnly ?? 'bold'}</i>;
      }`,
    // `@default` must be able to say undefined / null / false / 0 / '' without being read as "absent".
    'Falsy.tsx': `export interface P {
        /** x.
         * @default undefined */
        u?: string;
        /** x.
         * @default null */
        n?: string | null;
        /** x.
         * @default false */
        f?: boolean;
        /** x.
         * @default 0 */
        z?: number;
        /** x.
         * @default '' */
        e?: string;
        /** x.
         * @default 'x' */
        eMismatch?: string;
        /** x.
         * @default 0 */
        zVsFalse?: boolean;
        /** x.
         * @default undefined */
        uVsEmpty?: string;
        /** x. */
        noTag?: string;
      }
      export function Falsy(props: P) {
        const { u = undefined, n = null, f = false, z = 0, e = '', eMismatch = '', zVsFalse = false, uVsEmpty = '', noTag = '' } = props;
        return <i>{u}{n}{String(f)}{z}{e}{eMismatch}{String(zVsFalse)}{uVsEmpty}{noTag}</i>;
      }`,
    // Constants (same file, imported from another file), a template literal, a computed default.
    'Consts.tsx': `import { LIMIT, NAME } from './consts';
      const LOCAL = 5;
      declare function stepFrom(n: number): number;
      export interface P {
        /** x.
         * @default 5 */
        local?: number;
        /** x.
         * @default 6 */
        localWrong?: number;
        /** x.
         * @default 10 */
        imported?: number;
        /** x.
         * @default 11 */
        importedWrong?: number;
        /** x.
         * @default 1 */
        computed?: number;
        /** x.
         * @default 1 */
        computedAllowed?: number;
        /** x. */
        computedNoTag?: number;
        /** x.
         * @default 3 */
        coalesce?: number;
      }
      export function Consts(props: P) {
        const { local = LOCAL, localWrong = LOCAL, imported = LIMIT, importedWrong = LIMIT, computed = stepFrom(1), computedAllowed = stepFrom(2), computedNoTag = stepFrom(3), coalesce = LIMIT ?? 3 } = props;
        return <i>{local}{localWrong}{imported}{importedWrong}{computed}{computedAllowed}{computedNoTag}{coalesce}{NAME}</i>;
      }
      export interface TplProps {
        /** x.
         * @default 'name' */
        name?: string;
      }
      export function Tpl(props: TplProps) { const { name = \`name\` } = props; return <i>{name}</i>; }`,
    'consts.ts': `export const LIMIT = 10;\nexport const NAME = 'name';\n`,
    // Tag order and multi-line values.
    'Layout.tsx': `export interface P {
        /**
         * x.
         * @since 1.0.0
         * @default 'md'
         * @deprecated no.
         */
        before?: 'sm' | 'md';
        /**
         * x.
         * @deprecated no.
         * @default 'md'
         * @since 1.0.0
         */
        after?: 'sm' | 'md';
        /**
         * x.
         * @default [
         *   'a',
         *   'b',
         * ]
         */
        multi?: string[];
        /**
         * x.
         * @default [
         *   'a',
         * ]
         */
        multiWrong?: string[];
      }
      export function Layout(props: P) {
        const { before = 'md', after = 'md', multi = ['a', 'b',], multiWrong = ['a', 'b'] } = props;
        return <i>{before}{after}{multi}{multiWrong}</i>;
      }`,
    // A prop that redeclares an inherited one: the base's `@default` is not the prop's (the docgen does not show it).
    'Inherit.tsx': `interface Base {
        /** x.
         * @default false */
        loop?: boolean;
      }
      export interface P extends Base {
        /** x. */
        loop?: boolean;
      }
      export function Inherit(props: P) { const { loop = true } = props; return <i>{String(loop)}</i>; }`,
    // No default anywhere: no false positive.
    'Plain.tsx': `export interface P {
        /** The label. */
        label?: string;
        /** The default theme is dark, whatever that means. */
        theme?: string;
      }
      export function Plain({ label, theme }: P) { return <i>{label}{theme}</i>; }`,
    // Complete and coherent: the parameter default is shown by the docgen, the body default has its tag.
    'Complete.tsx': `export interface P {
        /** x. */
        param?: 'sm' | 'md';
        /** x.
         * @default 'md' */
        body?: 'sm' | 'md';
      }
      export function Complete({ param = 'md', ...props }: P) { const { body = 'md' } = props; return <i>{body}{param}</i>; }`,
  };
  const root = fixtureRoot(files);
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const result = measure({ root, entries: ['packages/core/src/index.ts'] });
  const allow = { 'Consts.computedAllowed': 'the default is a call (`stepFrom`), there is no literal to compare' };
  const issues = check(result, { allowlist: allow });
  const kinds = (component, prop) => issuesOf(issues, component).filter((i) => i.prop === prop).map((i) => i.kind);

  it('a matching @default (quotes, backticks or none, any spacing) is not an issue', () => {
    for (const p of ['ok', 'backtick', 'bare']) expect(kinds('Tags', p), p).toEqual([]);
  });
  it('a different @default is a mismatch naming component, prop, declared and source value', () => {
    const [m] = issuesOf(issues, 'Tags').filter((i) => i.prop === 'mismatch');
    expect(m.kind).toBe('mismatch');
    expect(m.message).toContain('@default "lg"');
    expect(m.message).toContain("'md'");
    expect(formatCheck([m])).toContain('Tags.mismatch [mismatch]');
  });
  it('a default in the source with no @default is missing; so is one only in the prose', () => {
    expect(kinds('Tags', 'missing')).toEqual(['missing-default']);
    expect(kinds('Tags', 'proseOnly')).toEqual(['missing-default']);
  });
  it('a @default repeated in the prose is redundant', () => {
    expect(kinds('Tags', 'redundant')).toEqual(['redundant-prose']);
  });
  it('a @default without a value is its own error', () => {
    expect(kinds('Tags', 'empty')).toEqual(['empty-default']);
  });
  it('undefined, null, false, 0 and the empty string are declared defaults, not absent ones', () => {
    for (const p of ['u', 'n', 'f', 'z', 'e']) expect(kinds('Falsy', p), p).toEqual([]);
    expect(rowIn(result, 'Falsy', 'e').declared).toBe("''");
  });
  it('they are not interchangeable either: each wrong pairing is a mismatch', () => {
    for (const p of ['eMismatch', 'zVsFalse', 'uVsEmpty']) expect(kinds('Falsy', p), p).toEqual(['mismatch']);
  });
  it('a falsy source default without a tag is still missing', () => {
    expect(kinds('Falsy', 'noTag')).toEqual(['missing-default']);
  });
  it('a constant (same file or imported) and a template literal are resolved and compared', () => {
    for (const p of ['local', 'imported']) expect(kinds('Consts', p), p).toEqual([]);
    expect(kinds('Consts', 'localWrong')).toEqual(['mismatch']);
    expect(kinds('Consts', 'importedWrong')).toEqual(['mismatch']);
    expect(kinds('Tpl', 'name')).toEqual([]);
  });
  it('a computed default is not compared: an error unless it is in the allowlist with a reason', () => {
    expect(kinds('Consts', 'computed')).toEqual(['non-literal']);
    expect(kinds('Consts', 'coalesce')).toEqual(['non-literal']);
    expect(kinds('Consts', 'computedAllowed')).toEqual([]);
  });
  it('a computed default without a tag is a plain missing default, not an allowlist matter', () => {
    expect(kinds('Consts', 'computedNoTag')).toEqual(['missing-default']);
  });
  it('an allowlist entry that is no longer needed fails the check (prop resolvable, prop gone, component gone)', () => {
    const stale = check(result, { allowlist: { ...allow, 'Consts.local': 'x', 'Consts.gone': 'x', 'Nope.prop': 'x' } }).filter((i) => i.kind === 'stale-allowlist');
    expect(stale.map((i) => `${i.component}.${i.prop}`)).toEqual(['Consts.gone', 'Consts.local', 'Nope.prop']);
    expect(check(result, { allowlist: allow }).filter((i) => i.kind === 'stale-allowlist')).toEqual([]);
  });
  it('tag order and a multi-line @default do not matter', () => {
    for (const p of ['before', 'after', 'multi']) expect(kinds('Layout', p), p).toEqual([]);
    expect(kinds('Layout', 'multiWrong')).toEqual(['mismatch']);
  });
  it('the @default of an inherited prop is not read for a prop that redeclares it', () => {
    expect(rowIn(result, 'Inherit', 'loop').declared).toBeUndefined();
    expect(kinds('Inherit', 'loop')).toEqual(['missing-default']);
  });
  it('a component with no default anywhere has no issue and no row', () => {
    expect(issuesOf(issues, 'Plain')).toEqual([]);
    expect(result.components.find((c) => c.component === 'Plain').rows).toEqual([]);
  });
  it('a complete component has no issue', () => {
    expect(issuesOf(issues, 'Complete')).toEqual([]);
  });
  it('reports divergent defaults and unresolved delegations as issues', () => {
    const synthetic = {
      components: [{ component: 'C', rows: [{ prop: 'p', kind: 'ok', where: 'param', source: "'a'", sourceValue: 'a', declared: undefined, prose: false, divergence: { own: "'a'", inner: "'b'", via: 'Inner' } }], unresolvedDelegations: ['Opaque'] }],
    };
    expect(check(synthetic, { allowlist: {} }).map((i) => `${i.prop}:${i.kind}`)).toEqual(['Opaque:unresolved-delegation', 'p:divergent-default']);
  });
  it('issues are sorted and identical on two runs', () => {
    const again = check(measure({ root, entries: ['packages/core/src/index.ts'] }), { allowlist: allow });
    expect(again).toEqual(issues);
    const keys = issues.map((i) => `${i.component}.${i.prop}`);
    expect(keys).toEqual([...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });
});

// ---------------------------------------------------------------------------------------------------------
// #474, second round (critic of PR #496): tags the docgen does not read, defaults written as fallbacks in the
// body, defaults with no readable source (allowlist), prose without backticks, partial spreads and overrides,
// `props.a` / `useX({ a })` / `<X.Y />`, the resolved value in the mismatch message.

describe('PROSE_DEFAULT: quotes, apostrophes and bare values (#474, round 2)', () => {
  it.each([
    "Defaults to 'md'.", 'Default "Loading". An empty label...', 'Default 1.', 'Default 0.', 'default: true', 'Default -1',
    'the anchor bar (default "Sections").', 'Default: "Error" / "Success".', 'The default is `md`.', 'Default “md”.', 'Default false',
    'Default: "Dismiss message: `<title>`", so strips', 'Defaults to `true`.',
  ])('matches %j', (text) => expect(PROSE_DEFAULT.test(text)).toBe(true));
  it.each([
    // The word itself quoted: it names a value (Field.stateReason, ConfirmDialog.initialFocus).
    'Required with `forced` and `locked`, optional with `disabled`, not allowed with `default`.',
    "the confirm button for `default`).\n\nUse `'cancel'` with `tone=\"default\"` when",
    // "the default <noun>": not the default of the prop (`asChild`).
    'Renders your single child element as the panel instead of the default `<div>`, with the props merged.',
    "The default theme is dark.", "the default's value", 'Default: derived from the tone', 'defaults to the first item',
  ])('does not match %j', (text) => expect(PROSE_DEFAULT.test(text)).toBe(false));
});

describe('check on synthetic rows (#474, round 2)', () => {
  const comp = (rows) => ({ components: [{ component: 'C', rows, unresolvedDelegations: [] }] });
  it('a gap whose `@default` the docgen did not show is `unread-tag`, never silent', () => {
    const rows = [{ prop: 'p', kind: 'gap', where: 'body', source: "'md'", sourceValue: 'md', declared: "'md'", declaredTag: 'default', prose: false }];
    expect(check(comp(rows), { allowlist: {} }).map((i) => i.kind)).toEqual(['unread-tag']);
  });
  it('`@defaultValue` is `wrong-tag` even when the column is filled', () => {
    const rows = [{ prop: 'p', kind: 'ok', where: 'param', source: "'md'", sourceValue: 'md', declared: "'md'", declaredTag: 'defaultValue', prose: false }];
    expect(check(comp(rows), { allowlist: {} }).map((i) => i.kind)).toEqual(['wrong-tag']);
  });
});

describe('the guard, second round, on fixture packages (#474)', () => {
  const files = {
    'Inner.tsx': `export interface InP {
        /** x. */ a?: string;
        /** x. */ b?: string;
      }
      export function Inner({ a = 'ia', b = 'ib' }: InP) { return <i>{a}{b}</i>; }
      export function useThing({ a = 'hook' }: InP) { return a; }`,
    // 1. \`@defaultValue\` (TSDoc spelling): the docgen ignores it.
    'Tags2.tsx': `export interface H1P {
        /**
         * x.
         * @defaultValue 'md'
         */
        size?: 'sm' | 'md';
      }
      export function H1(props: H1P) { const { size = 'md' } = props; return <i>{size}</i>; }
      export interface H1bP {
        /**
         * x.
         * @defaultValue 'lg'
         */
        size?: 'sm' | 'md' | 'lg';
      }
      export function H1b(props: H1bP) { const { size = 'md' } = props; return <i>{size}</i>; }`,
    // 2. Fallbacks in the body, and declared defaults with no readable source.
    'Fallbacks.tsx': `export interface P {
        /**
         * x.
         * @default 'lg'
         */
        size?: string;
      }
      export function P6c({ size }: P) { const s = size ?? 'md'; return <i>{s}</i>; }
      export function FbOk({ size }: P) { return <i>{size ?? 'lg'}</i>; }
      export function FbProps(props: P) { return <i>{props.size ?? 'md'}</i>; }
      export function FbRest({ ...rest }: P) { return <i>{rest.size ?? 'md'}</i>; }
      export function FbOr(props: P) { const a = props.size || 'or'; return <i>{a}</i>; }
      export function FbConflict({ size }: P) { return <i>{size ?? 'lg'}{size ?? 'xl'}</i>; }
      export function FbComputed({ size, label }: P & { label?: string }) { return <i>{size ?? label}</i>; }
      export function H9({ size }: P) { return <i>{size}</i>; }
      export function H9Allowed({ size }: P) { return <i>{size}</i>; }
      // Not a fallback of the prop: a local with the same name, \`||\` with undefined.
      export function FbLocal({ size: _s }: P) { const size = 'z' as string | undefined; return <i>{size ?? 'lg'}</i>; }
      export function FbOrUndefined({ size }: P) { return <i data-x={size || undefined} />; }
      export interface QP {
        /** x. */
        quiet?: string;
        /**
         * x.
         * @default false
         */
        flag?: boolean;
      }
      // A fallback with nothing declared is not a row of its own.
      export function FbQuiet({ quiet }: QP) { return <i>{quiet ?? 'q'}</i>; }
      export function FbFlag({ flag }: QP) { return <i aria-disabled={flag || undefined} />; }
      // \`||\` as a boolean or: not a default.
      export function FbOrBool({ flag, other }: QP & { other?: boolean }) { return <i data-x={String(flag || other)} data-y={String(flag || null)} />; }`,
    // 3. Prose without backticks next to a @default.
    'Prose2.tsx': `export interface P4 {
        /**
         * x. Defaults to 'md'.
         * @default 'md'
         */
        size?: string;
      }
      export function P4c(props: P4) { const { size = 'md' } = props; return <i>{size}</i>; }
      export interface P5 {
        /**
         * x. Default 1.
         * @default 1
         */
        level?: number;
      }
      export function P5c(props: P5) { const { level = 1 } = props; return <i>{level}</i>; }
      export interface P7 {
        /** Accessible name. Default "Loading". */
        label?: string;
        /** Not allowed with \`default\`. */
        reason?: string;
      }
      export function P7c({ label, reason }: P7) { return <i>{label}{reason}</i>; }`,
    // 4. Partial spread, override after the spread, a local value, renames.
    'Spreads.tsx': `import { Inner } from './Inner';
      import type { InP } from './Inner';
      export function H4(props: InP) { const { a, ...rest } = props; return <><Inner {...rest} /><span>{a}</span></>; }
      export function H4Param({ a, ...rest }: InP) { return <><Inner {...rest} /><span>{a}</span></>; }
      export function H4Back(props: InP) { const { a, ...rest } = props; return <Inner {...rest} a={a} />; }
      export function H6(props: InP) { return <Inner {...props} a="fixed" />; }
      export function H6Before(props: InP) { return <Inner a="fixed" {...props} />; }
      export function H8({ b }: InP) { const a = 'z'; return <Inner a={a} b={b} />; }
      export function Renamed({ b }: InP) { return <Inner a={b} />; }
      // A renamed key before a spread that carries the same key: two possible sources, not attributed.
      export function RenamedBefore(props: InP) { return <Inner a={props.b} {...props} />; }`,
    // 5. Union with the tag in a single branch (C3), \`Inner(props, ref)\` (C5).
    'Union2.tsx': `export type U2P = {
        /**
         * x.
         * @default 'lg'
         */
        size?: 'sm' | 'md' | 'lg';
        label: string;
      } | { icon: string };
      export function U2(props: U2P) { const { size = 'md' } = props as { size?: 'sm' | 'md' | 'lg' }; return <i>{size}</i>; }`,
    'Calls.tsx': `import { forwardRef, type Ref } from 'react';
      import type { InP } from './Inner';
      import { useThing } from './Inner';
      function Impl({ a = 'impl' }: InP, ref: Ref<HTMLElement>) { return <i ref={ref}>{a}</i>; }
      export const TwoArgs = forwardRef<HTMLElement, InP>(function TwoArgs(props, ref) { return Impl(props, ref); });
      export function H13({ a }: InP) { const v = useThing({ a }); return <i>{v}</i>; }
      export function H13Spread(props: InP) { const v = useThing({ ...props, a: 'own' }); return <i>{v}</i>; }`,
    // 6. \`props.a\`, member tags, a member of a consumer value.
    'Members.tsx': `import type { ComponentType } from 'react';
      import * as Parts from './Inner';
      import { Inner, type InP } from './Inner';
      export function H5(props: InP) { return <Inner a={props.a} b={props.b} />; }
      export const Kit = Object.assign(function KitRoot() { return null; }, { Item: Inner });
      export function NsTag(props: InP) { return <Parts.Inner {...props} />; }
      export function KitTag(props: InP) { return <Kit.Item {...props} />; }
      declare function makeKit(): { Item: ComponentType<InP> };
      export const Opaque = makeKit();
      export function OpaqueTag(props: InP) { return <Opaque.Item {...props} />; }
      export function ConsumerTag(props: InP & { Row: ComponentType<InP> }) { return <props.Row {...props} />; }`,
    // Render callback with a destructured parameter.
    'Render2.tsx': `import type { ReactNode } from 'react';
      import { Inner } from './Inner';
      function HostD({ renderX, a }: { renderX: (p: { a?: string }) => ReactNode; a?: string }) { return <div>{renderX({ a })}</div>; }
      export function H12(props: { /** x. */ a?: string }) { return <HostD {...props} renderX={({ a }) => <Inner a={a} />} />; }
      export function H12Rest(props: { /** x. */ a?: string }) { return <HostD {...props} renderX={({ ...p }) => <Inner {...p} />} />; }`,
    // 7. Constants: the mismatch shows the resolved literal.
    'Const2.tsx': `const LIMIT = 5;
      export interface P {
        /**
         * x.
         * @default 9
         */
        limit?: number;
      }
      export function ConstWrong(props: P) { const { limit = LIMIT } = props; return <i>{limit}</i>; }`,
    // A body destructuring of the rest of the parameter pattern.
    'RestBody.tsx': `export interface P {
        /**
         * x.
         * @default 'lg'
         */
        body?: string;
      }
      export function RestBody({ ...props }: P) { const { body = 'md' } = props; return <i>{body}</i>; }`,
  };
  const root = fixtureRoot(files);
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const result = measure({ root, entries: ['packages/core/src/index.ts'] });
  const allow = {
    'H9Allowed.size': 'a default of a third-party component',
    'FbComputed.size': 'derived from `label`',
  };
  const issues = check(result, { allowlist: allow });
  const kinds = (component, prop) => issuesOf(issues, component).filter((i) => i.prop === prop).map((i) => i.kind);
  const row = (c, p) => rowIn(result, c, p);

  // 1
  it('`@defaultValue` (which the docgen ignores) is an explicit error, not a silent pass nor a "missing tag"', () => {
    expect(row('H1', 'size')).toMatchObject({ kind: 'gap', declared: "'md'", declaredTag: 'defaultValue' });
    expect(kinds('H1', 'size')).toEqual(['wrong-tag']);
    const [i] = issuesOf(issues, 'H1');
    expect(i.message).toContain('write `@default`');
  });
  it('`@defaultValue` is still compared with the source', () => {
    expect(kinds('H1b', 'size')).toEqual(['mismatch', 'wrong-tag']);
  });

  // 2
  it('`prop ?? literal` in the body is compared with `@default` (P6c)', () => {
    expect(row('P6c', 'size')).toMatchObject({ where: 'fallback', sourceValue: 'md' });
    expect(kinds('P6c', 'size')).toEqual(['mismatch']);
    expect(kinds('FbOk', 'size')).toEqual([]);
  });
  it('`props.x ?? literal`, `rest.x ?? literal` and `props.x || literal` are compared too', () => {
    expect(kinds('FbProps', 'size')).toEqual(['mismatch']);
    expect(kinds('FbRest', 'size')).toEqual(['mismatch']);
    expect(row('FbOr', 'size')).toMatchObject({ where: 'fallback', sourceValue: 'or' });
    expect(kinds('FbOr', 'size')).toEqual(['mismatch']);
  });
  it('two fallbacks that disagree, or a computed one, are not comparable: an error unless allowlisted', () => {
    expect(kinds('FbConflict', 'size')).toEqual(['non-literal']);
    expect(kinds('FbComputed', 'size')).toEqual([]);
    expect(check(result, { allowlist: {} }).filter((i) => i.component === 'FbComputed').map((i) => i.kind)).toEqual(['non-literal']);
  });
  it('a `@default` with no default in the source (H9) is an error unless it is in the allowlist with a reason', () => {
    expect(row('H9', 'size')).toMatchObject({ where: 'tag', sourceValue: null });
    expect(kinds('H9', 'size')).toEqual(['unverified-default']);
    expect(kinds('H9Allowed', 'size')).toEqual([]);
  });
  it('a local with the name of the prop and `prop || undefined` are not fallbacks of the prop', () => {
    expect(row('FbLocal', 'size').where).toBe('tag');
    expect(kinds('FbLocal', 'size')).toEqual(['unverified-default']);
    expect(kinds('FbFlag', 'flag')).toEqual(['unverified-default']);
  });
  it('`prop || other` and `prop || null` are a boolean or, not a fallback', () => {
    expect(row('FbOrBool', 'flag').where).toBe('tag');
    expect(kinds('FbOrBool', 'flag')).toEqual(['unverified-default']);
  });
  it('a fallback with nothing declared makes no row (it only verifies a declared default)', () => {
    expect(row('FbQuiet', 'quiet')).toBeUndefined();
  });
  it('allowlist entries for undeclared-source defaults go stale like the others', () => {
    const stale = check(result, { allowlist: { ...allow, 'FbOk.size': 'x', 'FbQuiet.quiet': 'x' } }).filter((i) => i.kind === 'stale-allowlist');
    expect(stale.map((i) => `${i.component}.${i.prop}`)).toEqual(['FbOk.size', 'FbQuiet.quiet']);
  });

  // 3
  it('prose with apostrophes or a bare number next to a @default is redundant (P4c, P5c)', () => {
    expect(kinds('P4c', 'size')).toEqual(['redundant-prose']);
    expect(kinds('P5c', 'level')).toEqual(['redundant-prose']);
  });
  it('a default in double quotes is prose-only; "with `default`" is not a default', () => {
    expect(row('P7c', 'label')).toMatchObject({ kind: 'prose-only' });
    expect(row('P7c', 'reason')).toBeUndefined();
  });

  // 4
  it('a prop destructured before `...rest` does not reach the child through the rest (H4)', () => {
    for (const c of ['H4', 'H4Param']) {
      expect(row(c, 'a'), c).toBeUndefined();
      expect(row(c, 'b'), c).toMatchObject({ kind: 'gap', cause: 'delegated', source: "'ib'" });
    }
  });
  it('...unless it is passed back explicitly', () => {
    expect(row('H4Back', 'a')).toMatchObject({ kind: 'gap', cause: 'delegated', source: "'ia'" });
  });
  it('a key overridden after the spread, or set before a spread that carries it, does not get the child default (H6)', () => {
    expect(row('H6', 'a')).toBeUndefined();
    expect(row('H6', 'b')).toMatchObject({ kind: 'gap', cause: 'delegated' });
    expect(row('H6Before', 'a')).toBeUndefined();
  });
  it('a local value with the name of a prop is not the prop (H8)', () => {
    expect(row('H8', 'a')).toBeUndefined();
    expect(row('H8', 'b')).toMatchObject({ kind: 'gap', cause: 'delegated', source: "'ib'" });
  });
  it('a prop passed under another name carries the child default of that name', () => {
    expect(row('Renamed', 'b')).toMatchObject({ kind: 'gap', cause: 'delegated', source: "'ia'" });
  });
  it('a renamed key followed by a spread that carries it is not attributed to the renamed prop', () => {
    expect(row('RenamedBefore', 'b')).toMatchObject({ kind: 'gap', cause: 'delegated', source: "'ib'" });
    expect(row('RenamedBefore', 'a')).toBeUndefined();
  });

  // 5
  it('a @default in one branch of a union of props is read (U2)', () => {
    expect(row('U2', 'size').declared).toBe("'lg'");
    expect(kinds('U2', 'size')).toEqual(['mismatch']);
  });
  it('`Impl(props, ref)` (two arguments) is followed', () => {
    expect(row('TwoArgs', 'a')).toMatchObject({ kind: 'gap', cause: 'delegated', via: 'Impl', source: "'impl'" });
  });

  // 6
  it('`a={props.a}` is followed (H5)', () => {
    expect(row('H5', 'a')).toMatchObject({ kind: 'gap', cause: 'delegated', source: "'ia'" });
    expect(row('H5', 'b')).toMatchObject({ kind: 'gap', cause: 'delegated', source: "'ib'" });
  });
  it('`useX({ a })` with an object literal is followed, and a key set in it is not (H13)', () => {
    expect(row('H13', 'a')).toMatchObject({ kind: 'gap', cause: 'delegated', via: 'useThing', source: "'hook'" });
    expect(row('H13Spread', 'a')).toBeUndefined();
  });
  it('`<Parts.Inner {...props} />` and `<Kit.Item {...props} />` are followed', () => {
    for (const c of ['NsTag', 'KitTag']) expect(row(c, 'a'), c).toMatchObject({ kind: 'gap', cause: 'delegated', via: 'Inner' });
  });
  it('a member tag of a project value the script cannot read is unresolved; one of a consumer value is not followed', () => {
    expect(result.components.find((c) => c.component === 'OpaqueTag').unresolvedDelegations).toEqual(['Opaque.Item']);
    expect(result.components.find((c) => c.component === 'ConsumerTag').unresolvedDelegations).toEqual([]);
    expect(row('ConsumerTag', 'a')).toBeUndefined();
  });
  it('a render callback with a destructured parameter is followed; with a rest element it is unresolved', () => {
    expect(row('H12', 'a')).toMatchObject({ kind: 'gap', cause: 'delegated', via: 'Inner', source: "'ia'" });
    expect(result.components.find((c) => c.component === 'H12Rest').unresolvedDelegations).toEqual(['HostD.renderX']);
  });

  // 7
  it('the mismatch on a constant shows the value it resolves to', () => {
    const [m] = issuesOf(issues, 'ConstWrong');
    expect(m.message).toBe('`@default 9` but the source default is LIMIT (= 5)');
  });

  it('a body destructuring of the rest of the parameter is a source default, compared with @default', () => {
    expect(row('RestBody', 'body')).toMatchObject({ where: 'body', sourceValue: 'md' });
    expect(kinds('RestBody', 'body')).toEqual(['mismatch']);
  });
});

describe('the --check command line', { timeout: 120_000 }, () => {
  const run = (root) => spawnSync(process.execPath, [join(REPO_ROOT, 'scripts/default-column-measure.mjs'), '--check', '--root', root], { encoding: 'utf8' });
  const clean = fixtureRoot({ 'Clean.tsx': `export interface P { /** x. */ size?: 'sm' | 'md'; }\nexport function Clean({ size = 'md' }: P) { return <i>{size}</i>; }` });
  const dirty = fixtureRoot({ 'Dirty.tsx': `export interface P {\n  /** x.\n   * @default 'lg' */\n  size?: 'sm' | 'md' | 'lg';\n}\nexport function Dirty(props: P) { const { size = 'md' } = props; return <i>{size}</i>; }` });
  afterAll(() => {
    rmSync(clean, { recursive: true, force: true });
    rmSync(dirty, { recursive: true, force: true });
  });

  it('exits 0 and says OK on a package with no gaps or incoherences', () => {
    const r = run(clean);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('Default column check: OK\n');
  });
  it('exits non-zero on an incoherence and prints component, prop, declared and source value', () => {
    const r = run(dirty);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("Dirty.size [mismatch] `@default 'lg'` but the source default is 'md'");
    expect(r.stdout).toContain('1 problem');
  });
  it('prints the same bytes twice', () => {
    expect(run(dirty).stdout).toBe(run(dirty).stdout);
  });
});

describe('--check on the repository (#474)', { timeout: 120_000 }, () => {
  const result = measure();
  const script = join(REPO_ROOT, 'scripts/default-column-measure.mjs');
  it('exits non-zero while #475/#476 have not documented the props, with a sorted, repeatable list', () => {
    const r1 = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
    const r2 = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
    expect(r1.status).toBe(1);
    expect(r1.stdout).toBe(r2.stdout);
    expect(r1.stdout).toContain('Button.size [missing-default]');
  });
  it('ListReport and VirtualListReport get status and loadingRowCount through the renderTable render prop', () => {
    for (const comp of ['ListReport', 'VirtualListReport']) {
      for (const prop of ['status', 'loadingRowCount']) {
        expect(rowIn(result, comp, prop), `${comp}.${prop}`).toMatchObject({ kind: 'gap', cause: 'delegated' });
      }
    }
  });
  it('has no unresolved delegation, no divergent default and no stale allowlist entry', () => {
    const kinds = ['unresolved-delegation', 'divergent-default', 'stale-allowlist', 'mismatch', 'redundant-prose', 'empty-default', 'non-literal'];
    expect(check(result).filter((i) => kinds.includes(i.kind))).toEqual([]);
  });
  it('round 2: only missing defaults are left, none of the new kinds', () => {
    expect([...new Set(check(result).map((i) => i.kind))]).toEqual(['missing-default']);
  });
  it('round 2: every default the script cannot compare is in the allowlist, so #475 can add `@default` without being blocked', () => {
    // Simulate #475: a `@default` on every prop the guard reports as missing (written as the source value when there
    // is one), the prose removed.
    const missing = new Set(check(result).filter((i) => i.kind === 'missing-default').map((i) => `${i.component}.${i.prop}`));
    const tagged = {
      components: result.components.map((c) => ({
        ...c,
        rows: c.rows.map((r) => (missing.has(`${c.component}.${r.prop}`) ? { ...r, kind: 'ok', declared: r.sourceLiteral ?? r.source, declaredTag: 'default', prose: false } : r)),
      })),
    };
    expect(check(tagged)).toEqual([]);
    // Without the allowlist each of them would be an error: the entries are exactly the props that cannot be compared
    // (plus ProgressBar.getValueLabel, whose column the docgen already fills).
    const blocked = check(tagged, { allowlist: {} }).map((i) => `${i.component}.${i.prop}`).sort();
    expect(blocked).toEqual(Object.keys(UNCOMPARABLE_ALLOWLIST).filter((id) => id !== 'ProgressBar.getValueLabel').sort());
  });
  it('round 2: defaults stated in quotes are found (prose-only), and "with `default`" / "the default `<div>`" are not', () => {
    for (const id of ['MessageStrip.dismissLabel', 'ObjectPageFooter.toneLabel', 'ObjectPage.labels']) {
      const [c, p] = id.split('.');
      expect(rowIn(result, c, p), id).toMatchObject({ kind: 'prose-only' });
    }
    expect(rowIn(result, 'Field', 'stateReason')).toBeUndefined();
    expect(rowIn(result, 'DialogContent', 'asChild')).toBeUndefined();
  });
  it('round 2: a @default added next to `Default "Loading"` / `Default 1.` prose is redundant', () => {
    for (const id of ['Spinner.label', 'ObjectPageFooter.label', 'ObjectPage.headingLevel']) {
      const [c, p] = id.split('.');
      const r = rowIn(result, c, p);
      expect(r, id).toMatchObject({ prose: true });
      const withTag = { components: [{ component: c, rows: [{ ...r, declared: r.sourceLiteral ?? r.source, declaredTag: 'default' }], unresolvedDelegations: [] }] };
      expect(check(withTag, { allowlist: {} }).map((i) => i.kind), id).toEqual(['redundant-prose']);
    }
  });
  it('round 2: `useCombobox({ clearOnEmpty })` is followed (object literal argument)', () => {
    expect(rowIn(result, 'Combobox', 'clearOnEmpty')).toMatchObject({ kind: 'gap', cause: 'delegated', via: 'useCombobox', source: 'false' });
  });
});
