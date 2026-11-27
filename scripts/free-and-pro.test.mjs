import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPages, packageRuntimeExports } from './docs-coverage.mjs';
import { proDocsBase } from '../.storybook/story-globs.mjs';
import { FREE_AND_PRO, catalogExports, catalogHref, catalogProblems, docsPageId } from '../.storybook/free-and-pro.ts';

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
