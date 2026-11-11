// @vitest-environment node
// `tsup` builds two entries (`index`, `internal`) with `splitting: true` so the modules they share
// (most of the List Report: `internal.ts` exports the exact building blocks `index.ts`'s
// `ListReportTable`/`ListReport` are made of) are hoisted into one shared chunk, not duplicated.
// A duplicated module would silently split module-level state (e.g. a React Context instance)
// between the two entries: a consumer importing both (a `@formrail/pro` component next to
// a Free one) would see two different contexts that never see each other's values.
// `Checkbox` is exported from both `src/index.ts` (public) and `src/internal.ts` (re-exported only
// for this check) specifically so this test has something to compare: if the build ever duplicates
// the module, `Checkbox` from one entry stops being `===` the `Checkbox` from the other.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as indexEsm from '../dist/index.js';
import * as internalEsm from '../dist/internal.js';

type IndexApi = typeof import('../src/index');
type InternalApi = typeof import('../src/internal');

const require = createRequire(import.meta.url);
const indexCjs = require(fileURLToPath(new URL('../dist/index.cjs', import.meta.url))) as IndexApi;
const internalCjs = require(fileURLToPath(new URL('../dist/internal.cjs', import.meta.url))) as InternalApi;

describe('`@formrail/core/internal` shares its modules with the public entry (no duplicated instance)', () => {
  it('ESM: Checkbox is the exact same export from both entries', () => {
    expect(internalEsm.Checkbox).toBeDefined();
    expect(internalEsm.Checkbox).toBe((indexEsm as IndexApi).Checkbox);
  });

  it('CJS: Checkbox is the exact same export from both entries', () => {
    expect(internalCjs.Checkbox).toBeDefined();
    expect(internalCjs.Checkbox).toBe(indexCjs.Checkbox);
  });

  it('every building block the ticket requires is present on the built /internal entry', () => {
    const expected = [
      'Checkbox',
      'tableSize',
      'cellValue',
      'renderCell',
      'ROW_PITCH_EXTRA_PX',
      'ROW_HEIGHT_CLASS',
      'bodyCellClass',
      'SELECT_COLUMN_WIDTH',
      'DEFAULT_LABELS',
      'DEFAULT_LOADING_ROW_COUNT',
      'SkeletonRows',
      'StateRow',
      'Filler',
      'NoResultsContent',
      'ErrorContent',
      'wholeRows',
      'ListReportTableHead',
      'ListReportTableRow',
      'ListReportTableShell',
      'ListReportFrame',
      'useListReportResultIndex',
    ];
    for (const name of expected) {
      expect(internalEsm, `missing export ${name}`).toHaveProperty(name);
      expect(internalCjs, `missing export ${name}`).toHaveProperty(name);
    }
  });

  it('the internal entry does not re-export the public floorplan components (facade, not a re-export of index)', () => {
    expect(internalEsm).not.toHaveProperty('ListReportTable');
    expect(internalEsm).not.toHaveProperty('ListReport');
  });
});
