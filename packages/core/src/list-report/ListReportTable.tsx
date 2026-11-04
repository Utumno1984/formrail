import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { Icon } from '../icon/Icon';
import { CapIconSlot } from '../internal/CapIconSlot';
import { internalIcons } from '../internal/icons';
import { hasContent, textOf } from '../internal/react-nodes';
import { TruncatedText } from '../truncated-text/TruncatedText';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';
import {
  ALIGN_JUSTIFY,
  ALIGN_TEXT,
  bodyCellClass,
  captionClass,
  containerClass,
  headerCellClass,
  nodeWrapperClass,
  sortButtonClass,
  sortIconAscendingClass,
  sortIconClass,
  sortIconIdleClass,
  tableClass,
} from './list-report-table-styles';
import {
  DEFAULT_LABELS,
  DEFAULT_LOADING_ROW_COUNT,
  ErrorContent,
  Filler,
  NoResultsContent,
  SkeletonRows,
  StateRow,
  wholeRows,
  type ListReportTableLabels,
} from './ListReportTableStates';
import type { ListReportColumn, UseListReportReturn } from './types';

export type { ListReportTableLabels } from './ListReportTableStates';

export type ListReportTableStatus = 'ready' | 'loading' | 'error';

/** The table must have an accessible name: at least one of the three. */
type TableName =
  | { 'aria-label': string; 'aria-labelledby'?: string; caption?: ReactNode }
  | { 'aria-labelledby': string; 'aria-label'?: string; caption?: ReactNode }
  | { caption: NonNullable<ReactNode>; 'aria-label'?: string; 'aria-labelledby'?: string };

export type ListReportTableProps<Row> = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'aria-label' | 'aria-labelledby'> & {
  /** What `useListReport` returned: the table only renders it. */
  table: UseListReportReturn<Row>;
  /**
   * Maximum height of the scroll container (px or any CSS length). Without it the container takes
   * the height its parent gives it (e.g. a flex child with `min-height: 0`).
   */
  maxHeight?: number | string;
  /**
   * `loading` keeps the rows it has (or shows `loadingRowCount` skeleton rows when there are none);
   * `error` replaces the body with an error strip. Default `ready`.
   */
  status?: ListReportTableStatus;
  /**
   * Skeleton rows while loading without rows, and the minimum height of the body in every state
   * (`loadingRowCount x row height`), so that loading, empty, error and data share one footprint.
   * Default 5; with 0 the body is one row tall.
   */
  loadingRowCount?: number;
  /** Content of the error strip. Default: `labels.error`. */
  errorMessage?: ReactNode;
  /** Adds a retry button to the error strip. The focus then moves to the table container. */
  onRetry?: () => void;
  /** Adds a "clear filters" button to the "no results" state. The focus then moves to the table container. */
  onClearFilters?: () => void;
  /** Overrides the texts (partial: the rest keeps the English defaults). */
  labels?: Partial<ListReportTableLabels>;
} & TableName;

type BodyKind = 'loading' | 'error' | 'empty' | 'noResults' | 'data';

// Bundlers replace `process.env.NODE_ENV` in consumer builds; without `process` assume development.
const isDev = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
};

const DEFAULT_MIN_WIDTH = 120;

const toCss = (value: number | string): string => (typeof value === 'number' ? `${value}px` : value.trim());
const isPercent = (value: number | string | undefined): boolean => typeof value === 'string' && value.trim().endsWith('%');

/** The value in px when it is a plain pixel length (`120` or `'120px'`), else `null`. */
function pixels(value: number | string | undefined): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+(\.\d+)?px$/.test(value.trim())) return Number.parseFloat(value);
  return null;
}

/**
 * `min-width` of the table: the sum of the `width` (or, for columns without one or with a
 * percentage, the `minWidth`) of every column. When every column declares a `width` there is no
 * flexible column to absorb extra space, so the table is exactly as wide as its columns (px, rem,
 * and percentages as shares of the table): each column keeps the width it declared in a container
 * wider than the sum. Otherwise the table fills the container.
 */
function tableSize<Row>(columns: readonly ListReportColumn<Row>[]): { width: string; minWidth: string } {
  let px = 0;
  const other: string[] = [];
  for (const column of columns) {
    const base = column.width !== undefined && !isPercent(column.width) ? column.width : (column.minWidth ?? DEFAULT_MIN_WIDTH);
    const known = pixels(base);
    if (known === null) other.push(toCss(base));
    else px += known;
  }
  const sum = (px0: number, rest: string[]): string => (rest.length === 0 ? `${px0}px` : `calc(${[`${px0}px`, ...rest].join(' + ')})`);
  const minWidth = sum(px, other);
  if (columns.length === 0 || columns.some((column) => column.width === undefined)) return { minWidth, width: '100%' };

  // Every column declares a width: there is no flexible column to absorb extra space, so the table
  // is exactly as wide as its columns (else `table-layout: fixed` would stretch all of them).
  // Percentages are shares of the table itself: the absolute widths are (1 - shares) of it.
  let fixedPx = 0;
  const fixedOther: string[] = [];
  let share = 0;
  for (const column of columns) {
    if (isPercent(column.width)) share += Number.parseFloat(column.width as string) / 100;
    else if (pixels(column.width) !== null) fixedPx += pixels(column.width) as number;
    else fixedOther.push(toCss(column.width as string));
  }
  if (share >= 1 || (fixedPx === 0 && fixedOther.length === 0)) return { minWidth, width: '100%' };
  const absolute = sum(fixedPx, fixedOther);
  const total = share === 0 ? absolute : `calc(${absolute} / ${1 - share})`;
  return { minWidth: total, width: total };
}

type CellValue = { kind: 'empty' } | { kind: 'text'; text: string } | { kind: 'node'; node: ReactNode };

function cellValue<Row>(column: ListReportColumn<Row>, row: Row): CellValue {
  if (column.cell) {
    const content = column.cell(row);
    if (content === null || content === undefined || typeof content === 'boolean') return { kind: 'empty' };
    if (typeof content === 'string' || typeof content === 'number') return { kind: 'text', text: String(content) };
    return { kind: 'node', node: content };
  }
  if (!column.accessor) return { kind: 'empty' };
  const value = column.accessor(row);
  return value === null || value === undefined ? { kind: 'empty' } : { kind: 'text', text: String(value) };
}

function renderCell<Row>(column: ListReportColumn<Row>, row: Row): ReactNode {
  const value = cellValue(column, row);
  if (value.kind === 'empty') return null;
  if (value.kind === 'node') return <div className={nodeWrapperClass}>{value.node}</div>;
  return column.truncate === false ? <div className={nodeWrapperClass}>{value.text}</div> : <TruncatedText>{value.text}</TruncatedText>;
}

function ListReportTableImpl<Row>(props: ListReportTableProps<Row>, ref: Ref<HTMLDivElement>) {
  const {
    table,
    maxHeight,
    status = 'ready',
    loadingRowCount = DEFAULT_LOADING_ROW_COUNT,
    errorMessage,
    onRetry,
    onClearFilters,
    labels: labelOverrides,
    caption,
    className,
    style,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    ...rest
  } = props;
  const { columns } = table;
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mergedRef = useMemo(() => composeRefs(ref, containerRef), [ref]);

  const minRows = wholeRows(loadingRowCount);
  const hasRows = table.rows.length > 0;
  // What the body shows. `loading` with rows keeps them; `error` replaces them (declared behaviour).
  const view: 'error' | 'rows' | 'skeleton' | 'empty' | 'noResults' =
    status === 'error' ? 'error' : hasRows ? 'rows' : status === 'loading' ? 'skeleton' : table.totalCount === 0 ? 'empty' : 'noResults';
  // What is announced: the status wins over the rows (a reload with rows is still "loading").
  const kind: BodyKind = status === 'error' ? 'error' : status === 'loading' ? 'loading' : view === 'rows' ? 'data' : view === 'skeleton' ? 'loading' : view;
  const messageShown = view === 'error' || view === 'empty' || view === 'noResults';

  // The announcement of a change of state, derived while rendering (no effect, no announcement at
  // mount). The last change wins: the text is replaced, never queued. Inside `data` a change of the
  // result count (filter, search) is announced too, with the same text as the return from loading;
  // one derivation covers both, so a change that is both announces once.
  const [announced, setAnnounced] = useState<{ kind: BodyKind; count: number; text: string }>({
    kind,
    count: table.resultCount,
    text: '',
  });
  if (announced.kind !== kind || (kind === 'data' && announced.count !== table.resultCount)) {
    const text =
      kind === 'loading'
        ? labels.loading
        : kind === 'error'
          ? textOf(errorMessage).trim() || labels.error
          : kind === 'empty'
            ? labels.empty
            : kind === 'noResults'
              ? labels.noResults
              : labels.resultCount(table.resultCount);
    setAnnounced({ kind, count: table.resultCount, text });
  }

  // The message of a state sits in the visible part of the scroller: its width goes in a CSS variable
  // set on the element itself (no re-render of the table on every resize).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!messageShown || !el || typeof ResizeObserver === 'undefined') return undefined;
    el.style.setProperty('--rop-list-report-view-width', `${el.clientWidth}px`);
    const observer = new ResizeObserver(() => el.style.setProperty('--rop-list-report-view-width', `${el.clientWidth}px`));
    observer.observe(el);
    return () => {
      observer.disconnect();
      el.style.removeProperty('--rop-list-report-view-width');
    };
  }, [messageShown]);

  // The button that was clicked disappears with the state: the focus must not fall on the body.
  const thenFocusContainer = (action: (() => void) | undefined) =>
    action
      ? () => {
          containerRef.current?.focus();
          action();
        }
      : undefined;

  const named = !!ariaLabel?.trim() || !!ariaLabelledby?.trim() || hasContent(caption);
  useEffect(() => {
    if (!named && isDev()) {
      console.warn('[react-object-page] <ListReportTable> needs an accessible name: pass `aria-label`, `aria-labelledby` or `caption`.');
    }
  }, [named]);

  const size = tableSize(columns);
  const containerStyle: CSSProperties = { ...(maxHeight !== undefined ? { maxHeight } : null), ...style };

  return (
    <>
    <div
      // A scrollable region must be reachable by keyboard (axe `scrollable-region-focusable`).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      {...rest}
      ref={mergedRef}
      aria-busy={status === 'loading' ? true : undefined}
      className={cn(containerClass, className)}
      style={containerStyle}
    >
      <table
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className={tableClass}
        style={{ width: size.width, minWidth: size.minWidth }}
      >
        {hasContent(caption) ? <caption className={captionClass}>{caption}</caption> : null}
        <colgroup>
          {columns.map((column) => (
            <col key={column.id} style={column.width !== undefined ? { width: toCss(column.width) } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => {
              const align = column.align ?? 'start';
              const sortable = table.getSortButtonProps(column.id).onClick !== undefined;
              const sorted = table.sort?.columnId === column.id ? table.sort.direction : null;
              return (
                <th
                  key={column.id}
                  scope="col"
                  {...table.getHeaderProps(column.id)}
                  className={cn(headerCellClass, ALIGN_TEXT[align])}
                >
                  {sortable ? (
                    <button {...table.getSortButtonProps(column.id)} className={cn(sortButtonClass, ALIGN_JUSTIFY[align])}>
                      <TruncatedText>{column.header}</TruncatedText>
                      <CapIconSlot>
                        <Icon size="xs" className={cn(sortIconClass, sorted === null && sortIconIdleClass, sorted === 'asc' && sortIconAscendingClass)}>
                          {internalIcons['chevron-down']}
                        </Icon>
                      </CapIconSlot>
                    </button>
                  ) : (
                    <TruncatedText>{column.header}</TruncatedText>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {view === 'rows' ? (
            <>
              {table.rows.map((row) => (
                <tr key={table.getRowId(row)}>
                  {columns.map((column) => (
                    <td key={column.id} className={cn(bodyCellClass, ALIGN_TEXT[column.align ?? 'start'])}>
                      {renderCell(column, row)}
                    </td>
                  ))}
                </tr>
              ))}
              <Filler columnCount={columns.length} rows={minRows - table.rows.length} />
            </>
          ) : null}
          {view === 'skeleton' ? (
            <>
              <SkeletonRows columns={columns} count={minRows} />
              {/* loadingRowCount={0}: no skeleton, but the body keeps the height of one row */}
              <Filler columnCount={columns.length} rows={1 - minRows} />
            </>
          ) : null}
          {view === 'empty' ? (
            <StateRow columnCount={columns.length} rows={Math.max(1, minRows)}>
              <p className="m-0">{labels.empty}</p>
            </StateRow>
          ) : null}
          {view === 'noResults' ? (
            <StateRow columnCount={columns.length} rows={Math.max(1, minRows)}>
              <NoResultsContent
                message={labels.noResults}
                clearLabel={labels.clearFilters}
                onClearFilters={thenFocusContainer(onClearFilters)}
              />
            </StateRow>
          ) : null}
          {view === 'error' ? (
            <StateRow columnCount={columns.length} rows={Math.max(1, minRows)}>
              <ErrorContent
                message={hasContent(errorMessage) ? errorMessage : labels.error}
                retryLabel={labels.retry}
                onRetry={thenFocusContainer(onRetry)}
              />
            </StateRow>
          ) : null}
        </tbody>
      </table>
    </div>
    {/* Always mounted (a live region inserted already filled is not announced), empty until a state changes.
        A sibling after the container, not a child: inside the `aria-busy` element its changes may be withheld. */}
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {announced.text}
    </div>
    </>
  );
}

/**
 * The List Report table: a native `<table>` that renders the state of `useListReport`.
 *
 * - Widths are declared (`<colgroup>` + `table-layout: fixed`): a long cell never widens its
 *   column. The table has a `min-width` (sum of `width`/`minWidth`, default `minWidth` 120px) and
 *   scrolls inside its own container; the page does not overflow.
 * - Sortable headers are buttons inside `<th aria-sort>`; the sort logic stays in the hook.
 * - Text cells (a string/number from `cell`, or `String(accessor(row))`) are truncated with
 *   `TruncatedText` unless the column sets `truncate: false`. A `cell` that returns a React node is
 *   placed in a `min-width: 0; overflow: hidden` wrapper; its layout (and its height) is the
 *   consumer's responsibility. `null`/`undefined` give an empty cell.
 * - One scroller: the container (`forwardRef`) scrolls both ways and the header sticks to its top.
 *   Size it with the parent (flex) or with `maxHeight`. It is a tab stop so the keyboard can scroll.
 * - Every row has the height of `--rop-list-report-row-height`.
 * - States: `status="loading"` shows `loadingRowCount` skeleton rows (or keeps the rows it has),
 *   `"error"` replaces the body with an error strip, and a `ready` table without visible rows says
 *   whether there is no data at all or no result for the current filters. The header, the column
 *   widths and a body of at least `loadingRowCount` rows are the same in every state. A polite live
 *   region, always mounted, announces each change of state (never the first render).
 *
 * An accessible name is required: `aria-label`, `aria-labelledby` or a (visually hidden) `caption`.
 */
export const ListReportTable = /* @__PURE__ */ forwardRef(ListReportTableImpl) as <Row>(
  props: ListReportTableProps<Row> & { ref?: Ref<HTMLDivElement> },
) => ReactElement | null;
