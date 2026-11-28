import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPages, packageRuntimeExports } from './docs-coverage.mjs';
import { proDocsBase } from '../.storybook/story-globs.mjs';
import { BUDGETED_PACKAGES, BUDGETED_SUBPATHS, budgetFileName } from './bundle-budget.mjs';
import {
  BUDGET_FILES,
  FREE_AND_PRO,
  SSR_FRAMEWORKS_ISSUE,
  SSR_MODULES,
  catalogExports,
  catalogHref,
  catalogProblems,
  docsPageId,
  formatBytes,
  sizeSummary,
} from '../.storybook/free-and-pro.ts';

// Ticket #723: the "Free and Pro" table of the Introduction against the real public API. The exports are read with
// the helpers of the docs-coverage guard (every public entry: `index.ts` and the code subpaths of `exports`).

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const coreExports = packageRuntimeExports(ROOT, 'packages/core');
const proExports = packageRuntimeExports(ROOT, 'packages/pro');
const REFERENCE_PAGES = readdirSync(resolve(ROOT, '.storybook/reference'))
  .filter((name) => name.endsWith('.mdx'))
  .map((name) => `.storybook/reference/${name}`);
const corePages = collectPages(ROOT, 'packages/core', ['.storybook/Introduction.mdx', ...REFERENCE_PAGES]);
const proPages = collectPages(ROOT, 'packages/pro', ['.storybook/ProIntroduction.mdx']);

describe('Free and Pro table (#723)', () => {
  it('lists every runtime export of @formrail/core in the Free column, once, and nothing else', () => {
    expect(catalogProblems(FREE_AND_PRO, 'free', coreExports)).toEqual([]);
  });

  it('lists every runtime export of every public entry of @formrail/pro in the Pro column, once, and nothing else', () => {
    // The subpaths are read too: `useReactHookFormBinding` is only in `@formrail/pro/react-hook-form`.
    expect(proExports).toEqual(expect.arrayContaining(['VirtualListReport', 'useReactHookFormBinding', 'useTanStackFormBinding']));
    expect(catalogProblems(FREE_AND_PRO, 'pro', proExports)).toEqual([]);
  });

  it('every item opens a Docs page of its own package that exists and names the exports it stands for', () => {
    const problems = [];
    for (const [side, pages] of [
      ['free', corePages],
      ['pro', proPages],
    ]) {
      const byTitle = new Map(pages.map((page) => [page.title, page]));
      for (const row of FREE_AND_PRO) {
        for (const entry of row[side]) {
          const page = byTitle.get(entry.docs);
          if (!page) {
            problems.push(`${side} ${entry.label}: "${entry.docs}" is not a Docs page of the package`);
            continue;
          }
          expect(docsPageId(entry.docs)).toBe(page.id);
          for (const name of entry.exports) if (!page.source.includes(name)) problems.push(`${side} ${entry.label}: "${entry.docs}" never mentions ${name}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('nothing in Pro is a Free export, nothing in Free a Pro one', () => {
    const free = new Set(catalogExports(FREE_AND_PRO, 'free'));
    expect(catalogExports(FREE_AND_PRO, 'pro').filter((name) => free.has(name))).toEqual([]);
  });

  describe('the guard itself', () => {
    const rows = [{ area: 'A', free: [{ label: 'Input', docs: 'Forms/Input', exports: ['Input'] }], pro: [] }];

    it('a new export left out of the table fails', () => {
      expect(catalogProblems(rows, 'free', ['Input', 'NewThing'])).toEqual(['NewThing: exported but missing from the free column']);
    });

    it('a name that is not exported (a Pro feature not built) fails', () => {
      const withPlanned = [{ area: 'A', free: [], pro: [{ label: 'Planned', docs: 'Pro/Planned', exports: ['PlannedGrid'] }] }];
      expect(catalogProblems(withPlanned, 'pro', [])).toEqual(['PlannedGrid: in the pro column but not exported']);
      const empty = [{ area: 'A', free: [], pro: [{ label: 'Planned', docs: 'Pro/Planned', exports: [] }] }];
      expect(catalogProblems(empty, 'pro', [])).toEqual(['A / Planned: an item with no export']);
    });

    it('a name listed twice fails', () => {
      const twice = [{ area: 'A', free: [rows[0].free[0], { label: 'Again', docs: 'Forms/Input', exports: ['Input'] }], pro: [] }];
      expect(catalogProblems(twice, 'free', ['Input'])).toEqual(['Input: listed more than once in the free column']);
    });
  });

  describe('links', () => {
    const virtual = FREE_AND_PRO.flatMap((row) => row.pro).find((entry) => entry.label === 'Virtual List Report');

    it('a Pro link points to this Storybook in the complete build and to the Pro demo next to it in the Free build', () => {
      expect(proDocsBase({})).toBe('');
      expect(proDocsBase({ STORYBOOK_EXCLUDE_PRO: '1' })).toBe('../pro/');
      expect(catalogHref(virtual, 'pro', proDocsBase({}))).toBe('?path=/docs/pro-floorplans-virtual-list-report--docs');
      expect(catalogHref(virtual, 'pro', proDocsBase({ STORYBOOK_EXCLUDE_PRO: '1' }))).toBe('../pro/?path=/docs/pro-floorplans-virtual-list-report--docs');
    });

    it('a Free link always stays in this Storybook', () => {
      const input = FREE_AND_PRO.flatMap((row) => row.free).find((entry) => entry.label === 'Input');
      expect(catalogHref(input, 'free', '../pro/')).toBe('?path=/docs/forms-input--docs');
    });

    it('the Free build is published at /storybook/ and the Pro demo at /pro/, so ../pro/ is the Pro demo', () => {
      const assembler = readFileSync(resolve(ROOT, 'scripts/assemble-site.mjs'), 'utf8');
      expect(assembler).toMatch(/storybook\/\s+the Free Storybook/);
      expect(assembler).toMatch(/pro\/\s+the Pro demo Storybook/);
    });
  });
});

const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const INTRO = readFileSync(resolve(ROOT, '.storybook/Introduction.mdx'), 'utf8');
const BLOCKS = readFileSync(resolve(ROOT, '.storybook/free-and-pro-blocks.tsx'), 'utf8');

describe('Size and SSR: the sizes come from the committed baselines (#723)', () => {
  it('BUDGET_FILES is every baseline the bundle budget checks, and nothing else', () => {
    const expected = BUDGETED_PACKAGES.flatMap((dir) => ['.', ...(BUDGETED_SUBPATHS[dir] ?? [])].map((subpath) => relative(ROOT, join(dir, budgetFileName(subpath)))));
    expect(BUDGET_FILES.map((entry) => entry.file).sort()).toEqual(expected.sort());
    for (const { specifier, file } of BUDGET_FILES) {
      const [, pkg, subpath] = /^@formrail\/(core|pro)(?:\/(.+))?$/.exec(specifier) ?? [];
      expect(file, specifier).toBe(`packages/${pkg}/${budgetFileName(subpath ? `./${subpath}` : '.')}`);
    }
  });

  it('the page imports exactly those files, each under its specifier, and nothing measured', () => {
    const imported = [...BLOCKS.matchAll(/^import (\w+) from '\.\.\/(packages\/[^']+\.json)';$/gm)].map((m) => ({ name: m[1], file: m[2] }));
    expect(imported.map((m) => m.file).sort()).toEqual(BUDGET_FILES.map((entry) => entry.file).sort());
    for (const { specifier, file } of BUDGET_FILES) {
      const name = imported.find((m) => m.file === file).name;
      expect(BLOCKS, `${specifier} -> ${file}`).toContain(`'${specifier}': ${name},`);
    }
    // No dist/ or measuring code: the number follows the baseline, never the current build.
    expect(BLOCKS).not.toMatch(/from '[^']*(\/dist\/|bundle-budget\.mjs|zlib|esbuild)/);
  });

  it('prints each baseline as it is, from every file', () => {
    const summary = sizeSummary(BUDGET_FILES.map(({ specifier, file }) => ({ specifier, budget: readJson(file) })));
    for (const [i, { file }] of BUDGET_FILES.entries()) {
      const exportsOf = readJson(file).exports;
      expect(summary[i].count).toBe(Object.keys(exportsOf).length);
      expect(Object.fromEntries(summary[i].rows.map((row) => [row.name, row.bytes]))).toEqual(
        Object.fromEntries(Object.entries(exportsOf).map(([name, { baseline }]) => [name, baseline])),
      );
      const sizes = Object.values(exportsOf).map((e) => e.baseline);
      expect(summary[i].smallest.bytes).toBe(Math.min(...sizes));
      expect(summary[i].largest.bytes).toBe(Math.max(...sizes));
    }
  });

  it('a regenerated baseline changes the number on the page, the build does not', () => {
    const before = { exports: { Button: { baseline: 13483, limit: 14832 }, cn: { baseline: 10654, limit: 11720 } } };
    const after = { exports: { Button: { baseline: 14020, limit: 15422 }, cn: { baseline: 10654, limit: 11720 } } };
    const [one] = sizeSummary([{ specifier: '@formrail/core', budget: before }]);
    const [two] = sizeSummary([{ specifier: '@formrail/core', budget: after }]);
    expect(formatBytes(one.largest.bytes)).toBe('13.5 kB');
    expect(formatBytes(two.largest.bytes)).toBe('14.0 kB');
    expect(two.rows.find((row) => row.name === 'Button').bytes).toBe(14020);
  });

  it('an empty baseline fails loudly instead of printing nothing', () => {
    expect(() => sizeSummary([{ specifier: '@formrail/core', budget: { exports: {} } }])).toThrow(/lists no import/);
  });

  it('formats bytes: plain bytes under 1,000, kilobytes with one decimal above', () => {
    expect(formatBytes(164)).toBe('164 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1000)).toBe('1.0 kB');
    expect(formatBytes(62008)).toBe('62.0 kB');
    expect(formatBytes(10654)).toBe('10.7 kB');
  });
});

describe('Size and SSR: the server-rendering tests (#723)', () => {
  const ssrFiles = (dir) => {
    const out = [];
    const walk = (path) => {
      for (const name of readdirSync(path)) {
        if (name === 'node_modules' || name === 'dist') continue;
        const full = join(path, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name.endsWith('.ssr.test.tsx')) out.push(relative(ROOT, full));
      }
    };
    walk(resolve(ROOT, dir));
    return out;
  };

  it('SSR_MODULES lists every *.ssr.test.tsx of the packages, and only files that exist', () => {
    const onDisk = [...ssrFiles('packages/core/src'), ...ssrFiles('packages/pro/src')].sort();
    expect(onDisk.length).toBeGreaterThan(0);
    expect(SSR_MODULES.flatMap((module) => module.files).sort()).toEqual(onDisk);
  });

  it('each module is a runtime export of its package, listed once, and its tests render it on the server', () => {
    const exportsOf = { core: new Set(coreExports), pro: new Set(proExports) };
    const names = SSR_MODULES.map((module) => `${module.package}:${module.name}`);
    expect(names).toEqual([...new Set(names)]);
    for (const module of SSR_MODULES) {
      expect(exportsOf[module.package].has(module.name), `${module.name} is an export of ${module.package}`).toBe(true);
      for (const file of module.files) {
        expect(file.startsWith(`packages/${module.package}/`)).toBe(true);
        const source = readFileSync(resolve(ROOT, file), 'utf8');
        expect(source, file).toMatch(/renderToString/);
        expect(source, file).toContain(module.name);
      }
    }
  });

  it('the Introduction states the locale rule and the App Router status, with the link to #412', () => {
    expect(INTRO).toMatch(/## Size and SSR/);
    expect(INTRO).toMatch(/pass `locale`\s+and, where a component takes them, `timeZone` and `today`/);
    expect(INTRO).toMatch(/\*\*Next\.js App Router\.\*\* Not supported out of the box yet/);
    expect(INTRO).toContain(`(${SSR_FRAMEWORKS_ISSUE})`);
    for (const block of ['<SizeTable />', '<CnSize />', '<SsrModules pkg="core" />', '<SsrModules pkg="pro" />']) expect(INTRO).toContain(block);
  });
});
