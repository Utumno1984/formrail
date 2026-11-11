/**
 * `@formrail/core/internal`: building blocks of the List Report, for
 * `@formrail/pro` only (e.g. a virtualized table that mounts a subset of the rows but
 * must render **the same** table as the Free `ListReportTable`/`ListReport`).
 *
 * **Not public API**: no semver guarantee, nothing here is documented in a public story/MDX, and
 * it can change (or disappear) in a patch release of `@formrail/core`. `@formrail/pro`
 * pins its peer dependency on `@formrail/core` to an exact version for this reason (see
 * `.changeset/config.json`'s `fixed` pairing of the two packages). Do not import this module from
 * an application, from a core story/MDX, or from anywhere inside `packages/core/src` itself: a
 * `no-restricted-imports` ESLint rule (`eslint.config.js`) enforces that.
 *
 * Unrelated to the `src/internal/` directory next to this file (plain implementation details of
 * the core package itself — icons, story fixtures, `is-dev`, …): that one predates this entry and
 * stays private; this file is the single facade actually published at the `/internal` subpath.
 */

// Re-exported only so a consumer of this entry and of the public entry can assert, at the built
// `dist/`, that they share the exact same module instance (see `test/internal-identity.test.ts`):
// the tsup config must not duplicate a module shared by both of its entries (`index`, `internal`).
// `Checkbox` is also a real dependency of `ListReportTableRow`/`ListReportTableHead` below, and it
// is already public (re-exported here under the same identity, nothing new is made public by this).
/** @internal */
export { Checkbox } from './checkbox/Checkbox';

/** @internal Table sizing (`<colgroup>`/`<table>` width) and cell rendering, shared by the Shell/Head/Row below. */
export { tableSize } from './list-report/list-report-table-layout';
/** @internal */
export { cellValue, renderCell } from './list-report/list-report-cell';
/** @internal */
export type { CellValue, RenderCellOptions } from './list-report/list-report-cell';

/** @internal Class names and layout constants of the List Report table (`list-report-table-styles.ts`). */
export {
  ALIGN_JUSTIFY,
  ALIGN_TEXT,
  bodyCellClass,
  captionClass,
  containerClass,
  fillerCellClass,
  headerCellClass,
  nodeWrapperClass,
  ROW_HEIGHT_CLASS,
  ROW_PITCH_EXTRA_PX,
  SELECT_COLUMN_WIDTH,
  selectableRowClass,
  selectBodyCellClass,
  selectBoxClass,
  selectHeaderCellClass,
  skeletonBarClass,
  sortButtonClass,
  sortIconAscendingClass,
  sortIconClass,
  sortIconIdleClass,
  stateBoxClass,
  stateCellClass,
  stateStripClass,
  tableClass,
} from './list-report/list-report-table-styles';

/** @internal The stable-footprint state content (skeleton/empty/noResults/error) of the table's body. */
export {
  DEFAULT_LABELS,
  DEFAULT_LOADING_ROW_COUNT,
  ErrorContent,
  Filler,
  NoResultsContent,
  SkeletonRows,
  StateRow,
  wholeRows,
} from './list-report/ListReportTableStates';
/** @internal */
export type { ListReportTableLabels } from './list-report/ListReportTableStates';

/** @internal `<colgroup>` + `<thead>`: see `ListReportTableHead.tsx` for what it renders and why it is one piece. */
export { ListReportTableHead } from './list-report/ListReportTableHead';
/** @internal */
export type { ListReportTableHeadProps } from './list-report/ListReportTableHead';

/** @internal One data `<tr>`: see `ListReportTableRow.tsx`. */
export { ListReportTableRow } from './list-report/ListReportTableRow';
/** @internal */
export type { ListReportTableRowProps } from './list-report/ListReportTableRow';

/** @internal The table's shell (scroller, `<table>`, states, announcement, `renderBody`): see `ListReportTableShell.tsx`. */
export { ListReportTableShell } from './list-report/ListReportTableShell';
/** @internal */
export type {
  ListReportTableBodyContext,
  ListReportTableProps,
  ListReportTableShellProps,
  ListReportTableStatus,
} from './list-report/ListReportTableShell';

/** @internal The floorplan without a fixed table (title, filters, selection bar, `renderTable`): see `ListReportFrame.tsx`. */
export { ListReportFrame } from './list-report/ListReportFrame';
/** @internal */
export type { ListReportFrameLabels, ListReportFrameProps, ListReportFrameTableProps } from './list-report/ListReportFrame';

/** @internal Memoized `resultIds`/`indexOfResult` for a range-selection gesture: see `use-list-report-result-index.ts`. */
export { useListReportResultIndex } from './list-report/use-list-report-result-index';
/** @internal */
export type { ListReportResultIndex } from './list-report/use-list-report-result-index';
