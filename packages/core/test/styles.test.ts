// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cn } from '../src/index';
import { customProperties, findGlobalLeaks, stripComments } from './helpers/css-analysis';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tokensCss = readFileSync(join(packageDir, 'src/styles/tokens.css'), 'utf8');
const themeCss = readFileSync(join(packageDir, 'dist/theme.css'), 'utf8');
const stylesCss = readFileSync(join(packageDir, 'dist/styles.css'), 'utf8');

const tokenVars = customProperties(tokensCss);
const tokenNames = [...tokenVars.keys()];
const namesOf = (group: string): string[] =>
  tokenNames
    .filter((n) => n.startsWith(`--${group}-`) && !n.includes('--', 2 + group.length))
    .map((n) => n.slice(`--${group}-`.length));

describe('design tokens (src/styles/tokens.css, built into dist/theme.css and dist/styles.css)', () => {
  it('theme.css is the token source as is', () => {
    expect(themeCss).toBe(tokensCss);
  });

  it('defines semantic colors, the typographic scale, sans + mono families, radii', () => {
    for (const color of ['text', 'surface', 'border', 'primary', 'info', 'success', 'warning', 'error']) {
      expect(tokenVars.has(`--color-rop-${color}`), `color ${color}`).toBe(true);
    }
    for (const size of ['caption', 'body', 'label', 'title-sm', 'title-md', 'title-lg']) {
      expect(tokenVars.has(`--text-rop-${size}`), `size ${size}`).toBe(true);
      expect(tokenVars.has(`--text-rop-${size}--line-height`), `line height ${size}`).toBe(true);
    }
    expect(tokenVars.has('--font-rop-sans')).toBe(true);
    expect(namesOf('radius').length).toBeGreaterThan(0);
  });

  it('the mono stack is a system stack ending with the generic `monospace`, no web font', () => {
    const mono = tokenVars.get('--font-rop-mono') ?? '';
    expect(mono.split(',').pop()?.trim()).toBe('monospace');
    expect(tokensCss).not.toMatch(/@font-face|url\(/);
    expect(stylesCss).not.toMatch(/@font-face|url\(/);
  });

  it('the z-index scale is strictly increasing: sticky < overlay < modal < popover < tooltip', () => {
    // Read from the generated CSS, not from the source.
    const generated = customProperties(stylesCss);
    const order = ['sticky', 'overlay', 'modal', 'popover', 'tooltip'];
    const values = order.map((name) => Number(generated.get(`--z-index-rop-${name}`)));
    expect(values.every((v) => Number.isInteger(v))).toBe(true);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i], `${order[i]} above ${order[i - 1]}`).toBeGreaterThan(values[i - 1] as number);
    }
  });

  it('every custom property lives in ONE namespace and none redefines a default Tailwind token', () => {
    const namespaces = new Set<string>();
    for (const name of customProperties(themeCss).keys()) {
      const match = /^--(color|text|font|radius|z-index|icon|container|motion|animate)-([a-z]+)-/.exec(name);
      expect(match, `${name} is outside a <group>-<namespace>- prefix`).not.toBeNull();
      namespaces.add(match?.[2] as string);
    }
    expect([...namespaces]).toEqual(['rop']);
    // Default Tailwind tokens must not appear in the token file.
    expect(stripComments(tokensCss)).not.toMatch(
      /--spacing\s*:|--color-(red|blue|gray|green)-\d+|--breakpoint-|--tw-/,
    );
    // No bare `@import "tailwindcss"` and no preflight reference in the published token file.
    expect(themeCss).not.toMatch(/@import|preflight/i);
  });
});

describe('styles.css (compiled)', () => {
  it('has no preflight, no global element selector, and every rule inside @layer', () => {
    expect(findGlobalLeaks(stylesCss)).toEqual([]);
    expect(stylesCss).toMatch(/@layer rop\.utilities\s*\{/);
    // Generic layer names would merge with (and reorder) the host app's own layers.
    expect(stylesCss).not.toMatch(/@layer\s+(theme|base|components|utilities|reset)\b/);
  });

  it('declares no custom property outside the rop namespace (no global --spacing, ...)', () => {
    const outside = [...customProperties(stylesCss).keys()].filter(
      // `--tw-*` are Tailwind's own inert internals (same policy as findGlobalLeaks): any font-weight
      // utility declares `--tw-font-weight`. `--rop-vv-*` are the Dialog's own visual-viewport
      // variables (#11), in the rop namespace. `--rop-list-report-*` is the List Report table's own
      // row-height variable (#49), also in the rop namespace; `--rop-object-page-footer-height` is the Object
      // Page footer's own declared row height (#57); `--rop-modal-from-*` are the modal panel's
      // enter / exit start values (#76). Any other non-rop property still fails.
      (name) =>
        !/^--(color|text|font|radius|z-index|icon|container|motion|animate)-rop-/.test(name) &&
        !name.startsWith('--tw-') &&
        !name.startsWith('--rop-vv-') &&
        !name.startsWith('--rop-modal-from-') &&
        !name.startsWith('--rop-list-report-') &&
        name !== '--rop-object-page-footer-height',
    );
    expect(outside).toEqual([]);
    // Tailwind's default spacing is inlined into the utilities, not referenced as a variable.
    expect(stylesCss).not.toContain('var(--spacing)');
  });

  it('the global (un-namespaced) `properties` layer holds only inert --tw-* defaults, none of the shadow/ring/outline/translate family', () => {
    // Tailwind v4 emits `@layer properties` whatever the prefix; it stays harmless as long as no
    // component pulls in the utilities that fill it with dozens of globals (checked here for #7).
    const block = /@layer properties\s*\{[\s\S]*?\n\}/.exec(stylesCss)?.[0] ?? '';
    const declared = [...block.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1] as string);
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.filter((name) => !name.startsWith('--tw-'))).toEqual([]);
    expect(declared.filter((name) => /shadow|ring|outline|translate|rotate|scale|skew|blur/.test(name))).toEqual([]);
  });

  it('the leak checker allows only inert --tw-* internals, a real global reset still fails', () => {
    const internals =
      '@layer properties { @supports (x: y) { *, ::before, ::after, ::backdrop { --tw-shadow: 0 0 #0000; --tw-ring-inset: ; } } }';
    expect(findGlobalLeaks(`${internals} @property --tw-shadow { syntax: "*"; inherits: false; }`)).toEqual([]);
    expect(findGlobalLeaks('@layer base { * { margin: 0; } }')).toContain('global selector: *');
    expect(findGlobalLeaks('@layer base { *, ::before, ::after { margin: 0; } }').length).toBeGreaterThan(0);
    expect(
      findGlobalLeaks('@layer base { *, ::before { --tw-shadow: 0; margin: 0; } }').length,
    ).toBeGreaterThan(0);
    expect(findGlobalLeaks('@layer base { html { --tw-shadow: 0; } }')).toContain('global selector: html');
    expect(findGlobalLeaks('@property --other { syntax: "*"; inherits: false; }').length).toBeGreaterThan(0);
  });

  it('the leak checker allows only `@keyframes rop-*` at the top level (they cannot live in a layer); any other still fails', () => {
    expect(findGlobalLeaks('@keyframes rop-modal-in { from { opacity: 0; } to { opacity: 1; } }')).toEqual([]);
    expect(findGlobalLeaks('@keyframes spin { from { opacity: 0; } }')).toContain('rule outside @layer: @keyframes spin');
    expect(findGlobalLeaks('@keyframes fade-rop-in { to { opacity: 1; } }').length).toBeGreaterThan(0);
    // Not a way to smuggle a global rule in next to the keyframes.
    expect(findGlobalLeaks('@keyframes rop-a { to { opacity: 1; } } body { margin: 0; }')).toContain(
      'rule outside @layer: body',
    );
  });

  it('every `animation` utility of the library names a `rop-` keyframes that is defined, and each one is used', () => {
    const defined = [...stylesCss.matchAll(/@keyframes\s+(rop-[a-z0-9-]+)/g)].map((m) => m[1] as string);
    expect(defined.length).toBeGreaterThan(0);
    const used = [...customProperties(stylesCss).entries()]
      .filter(([name]) => name.startsWith('--animate-rop-'))
      .map(([, value]) => value.split(/\s+/)[0] as string);
    expect(new Set(used)).toEqual(new Set(defined));
  });

  it('the leak checker does not split a class name at an escaped comma, but still splits real selectors', () => {
    expect(
      findGlobalLeaks('@layer rop.utilities { .grid-cols-\\[minmax\\(0\\,1fr\\)\\] { display: grid; } }'),
    ).toEqual([]);
    expect(findGlobalLeaks('@layer base { .a, body { margin: 0; } }')).toContain('global selector: body');
  });

  it('the leak checker does fail on a reset, a global selector or an un-layered rule', () => {
    expect(findGlobalLeaks('*, ::before, ::after { box-sizing: border-box; }').length).toBeGreaterThan(0);
    expect(findGlobalLeaks('@layer base { html { line-height: 1.5; } }')).toContain('global selector: html');
    expect(findGlobalLeaks('@layer base { body { margin: 0; } }')).toContain('global selector: body');
    expect(findGlobalLeaks('@layer base { button { color: red; } }')).toContain('global selector: button');
    expect(findGlobalLeaks('.px-2 { padding-inline: 1px; }')).toContain('rule outside @layer: .px-2');
    expect(findGlobalLeaks('@layer theme { :root { color: red; } }')).toContain(
      ':root declares something other than custom properties',
    );
    expect(findGlobalLeaks('@layer utilities { .px-2 { padding-inline: 1px; } }')).toEqual([]);
    // Tailwind's nested `@supports` fallback for a derived token is fine while it only declares variables.
    expect(
      findGlobalLeaks('@layer theme { :root { --a: 1; @supports (color: red) { --b: var(--a); } } }'),
    ).toEqual([]);
    expect(
      findGlobalLeaks('@layer theme { :root { --a: 1; @supports (color: red) { color: red; } } }'),
    ).toContain(':root declares something other than custom properties');
    // Regression: unwrapping `@supports` must not merge its last declaration with whatever
    // follows the block when the source has no trailing `;` before the `}` (Tailwind's own output).
    expect(
      findGlobalLeaks('@layer theme { :root { @supports (color: red) { --b: 1 } color: red; } }'),
    ).toContain(':root declares something other than custom properties');
  });

  it('contains the utilities used by the sources (fixture) and the rop tokens as variables', () => {
    const fixture = readFileSync(join(packageDir, 'src/internal/style-fixture.ts'), 'utf8');
    expect(fixture).toContain('z-rop-popover');
    expect(stylesCss).toContain('.z-rop-popover');
    expect(stylesCss).toContain('.font-rop-mono');
    expect(stylesCss).toContain('.px-2');
    expect(stylesCss).toContain('--color-rop-primary');
  });

  it('does NOT contain utilities no source uses (no safelist)', () => {
    expect(stylesCss).not.toContain('skew-x-12');
    // (was `.z-rop-sticky` until the List Report table header, #49, started using it)
    // (was `.z-rop-tooltip` until the overlay layer map, #10, started using every level)
    // (was `.text-rop-title-lg` until Title started using it, #6)
    // (was `.rounded-rop-lg` until the Dialog started using it, #11)
    // (was `.rounded-rop-sm` until StatusBadge started using it, #86; replaced by another unused utility)
    // (was `.bg-rop-blue-50` until the ListReport count pill, #75, started using it; replaced by another unused utility)
    expect(stylesCss).not.toContain('.bg-rop-blue-800');
  });

  it('is deterministic: two builds produce the same bytes as dist/styles.css', () => {
    const dirs = [mkdtempSync(join(tmpdir(), 'rop-css-a-')), mkdtempSync(join(tmpdir(), 'rop-css-b-'))];
    try {
      for (const dir of dirs) {
        execFileSync(process.execPath, [join(packageDir, 'scripts/build-css.mjs'), dir], {
          cwd: packageDir,
          stdio: 'pipe',
        });
      }
      const [a, b] = dirs.map((dir) => readFileSync(join(dir, 'styles.css')));
      expect(Buffer.compare(a as Buffer, b as Buffer)).toBe(0);
      expect(Buffer.compare(a as Buffer, readFileSync(join(packageDir, 'dist/styles.css')))).toBe(0);
    } finally {
      for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('cn() knows every token of the CSS source', () => {
  it('there are tokens to check (the derivation did not silently produce an empty list)', () => {
    expect(namesOf('z-index')).toHaveLength(5);
    expect(namesOf('text').length).toBeGreaterThanOrEqual(6);
  });

  it.each(namesOf('z-index'))('z-index token %s conflicts with an arbitrary z', (name) => {
    expect(cn(`z-${name}`, 'z-[1]')).toBe('z-[1]');
    expect(cn('z-[1]', `z-${name}`)).toBe(`z-${name}`);
  });

  it.each(namesOf('text'))('font-size token %s conflicts with another size, not with a color', (name) => {
    expect(cn(`text-${name}`, 'text-lg')).toBe('text-lg');
    expect(cn(`text-${name}`, 'text-rop-error')).toBe(`text-${name} text-rop-error`);
  });

  it.each(namesOf('font'))('font-family token %s conflicts with an arbitrary family', (name) => {
    expect(cn(`font-${name}`, 'font-[family-name:Georgia]')).toBe('font-[family-name:Georgia]');
  });

  it.each(namesOf('color'))('color token %s conflicts with an arbitrary color', (name) => {
    expect(cn(`bg-${name}`, 'bg-[#fff]')).toBe('bg-[#fff]');
    expect(cn(`text-${name}`, 'text-[#fff]')).toBe('text-[#fff]');
  });
});
