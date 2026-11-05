import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { flushSync } from 'react-dom';
import { composeRefs } from '@react-object-page/core';
import {
  Filler,
  ListReportTableRow,
  ListReportTableShell,
  useListReportResultIndex,
  type ListReportTableBodyContext,
  type ListReportTableProps,
} from '@react-object-page/core/internal';
import { isDev } from '../internal/is-dev';
import { useIsomorphicLayoutEffect } from '../internal/use-isomorphic-layout-effect';
import { scrollTopForIndex } from '../internal/virtual-rows';
import { applyRange, rangeIds } from './range-selection';
import { useVirtualRows } from './use-virtual-rows';

export type { ScrollAlign } from '../internal/virtual-rows';

/** Imperative API of `VirtualListReportTable` (`handleRef`). */
export interface VirtualListReportTableHandle {
  /**
   * Scrolls the table so that the row with this id is visible below the sticky header.
   * `align`: `auto` (default) scrolls the minimum, or not at all when the row is already fully
   * visible; `start`/`center`/`end` place it relative to the visible area of the body.
   * Returns `false` (and does not scroll) when the id is not among the current results.
   */
  scrollToRowId(id: string, options?: { align?: 'auto' | 'start' | 'center' | 'end' }): boolean;
}

export type VirtualListReportTableProps<Row> = ListReportTableProps<Row> & {
  /**
   * Number of results from which the rows are virtualized. Default 200. Below it (and with no rows,
   * and in the loading/empty/no-results/error states) nothing is virtualized: the DOM is the one of
   * the Free `ListReportTable` and no scroll listener or ResizeObserver is attached.
   */
  virtualizeThreshold?: number;
  /** Rows mounted above and below the visible area when virtualized. Default 10. */
  overscan?: number;
  /** Imperative API (`scrollToRowId`). The `ref` stays the scroll container, as in the Free table. */
  handleRef?: Ref<VirtualListReportTableHandle>;
};

const DEFAULT_THRESHOLD = 200;
const DEFAULT_OVERSCAN = 10;
const FORCE_TRUNCATE = { forceTruncate: true } as const;
// Pro stylesheet (`styles.css`): caps the content of a cell at the row height, so a `node` cell can
// never make a row taller than the pitch the range is computed with.
const VIRTUAL_ROW_CLASS = 'rop-pro-virtual-row';

type RowPropsById = Map<string, HTMLAttributes<HTMLTableRowElement>>;

const TAB_STOPS = 'a[href], button, input, select, textarea, [tabindex]';
/** The keyboard tab stops of a row, in document order. */
const tabStops = (row: Element): HTMLElement[] =>
  Array.from(row.querySelectorAll<HTMLElement>(TAB_STOPS)).filter(
    (el) => el.tabIndex >= 0 && !(el as HTMLInputElement).disabled && el.getAttribute('aria-hidden') !== 'true',
  );

const isRowCheckbox = (target: EventTarget | null): target is HTMLInputElement =>
  target instanceof HTMLInputElement && target.type === 'checkbox' && target.closest('tbody') !== null;

function VirtualListReportTableImpl<Row>(props: VirtualListReportTableProps<Row>, ref: Ref<HTMLDivElement>) {
  const {
    virtualizeThreshold = DEFAULT_THRESHOLD,
    overscan = DEFAULT_OVERSCAN,
    handleRef,
    onKeyDown,
    onMouseDown,
    style,
    ...shellProps
  } = props;
  const { table, status = 'ready' } = props;
  const { selection } = table;
  const count = table.rows.length;
  // The Shell renders the rows only in this case (`view === 'rows'`); every other state is its own.
  const showsRows = status !== 'error' && count > 0;
  const virtual = showsRows && count >= Math.max(0, virtualizeThreshold);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const mergedRef = useMemo(() => composeRefs(ref, scrollerRef), [ref]);
  const { resultIds, indexOfResult } = useListReportResultIndex(table);

  // --- Focus: the row holding it stays mounted (pinned) outside the range --------------------------
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focusedIndex = focusedId === null ? -1 : indexOfResult(focusedId);
  const pinnedIndex = focusedIndex >= 0 ? focusedIndex : null;

  const { segments, spacerHeight, scrollToIndex } = useVirtualRows({
    enabled: virtual,
    count,
    overscan,
    pinnedIndex,
    scrollerRef,
  });

  // The row with the focus left the results (filter, search): its checkbox is gone, so the focus goes
  // to the container instead of the body (the same rule as the buttons of the Free table's states).
  useIsomorphicLayoutEffect(() => {
    if (focusedId === null || focusedIndex >= 0) return;
    setFocusedId(null);
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) scrollerRef.current?.focus({ preventScroll: true });
  }, [focusedId, focusedIndex]);

  const onRowFocus = useCallback((id: string) => setFocusedId((current) => (current === id ? current : id)), []);
  const onRowBlur = useCallback((id: string, event: FocusEvent<HTMLTableRowElement>) => {
    const next = event.relatedTarget;
    // Leaving for another element: unpin. Without a related target (window blur, element removed) keep
    // it: one extra mounted row at worst.
    if (next instanceof Node && !event.currentTarget.contains(next)) setFocusedId((current) => (current === id ? null : current));
  }, []);

  // --- Selection extensions: range gesture (shift-click / Shift+Space), Escape ------------------
  const anchor = useRef<string | null>(null);
  const shiftSpace = useRef(false);
  // The anchor is invalidated when it leaves the results (it does not come back with them).
  useIsomorphicLayoutEffect(() => {
    if (anchor.current !== null && indexOfResult(anchor.current) < 0) anchor.current = null;
  }, [indexOfResult]);

  // Stable identity (the rows are memoized on it): the live values are read through a ref at gesture
  // time, not captured, so a skipped row render never leaves it with a stale selection or result index.
  // Written on commit: a render that never commits (a suspended transition) must not change what a
  // gesture on the rows on screen acts on.
  const toggleDeps = useRef({ indexOfResult, resultIds, selection });
  useIsomorphicLayoutEffect(() => {
    toggleDeps.current = { indexOfResult, resultIds, selection };
  });
  const onToggle = useCallback(
    (id: string, event: MouseEvent<HTMLInputElement>) => {
      const { indexOfResult, resultIds, selection } = toggleDeps.current;
      const shift = event.shiftKey || shiftSpace.current;
      shiftSpace.current = false;
      const from = anchor.current === null ? -1 : indexOfResult(anchor.current);
      const to = indexOfResult(id);
      if (shift && from >= 0 && to >= 0) {
        // The whole range takes the state the clicked row gets from this gesture; one gesture, one change.
        selection.setSelectedIds(applyRange(selection.selectedIds, rangeIds(resultIds, from, to), !selection.isSelected(id)));
        // A shift-click with the mouse had its default (text selection, focus) cancelled on mousedown.
        const input = event.target as HTMLInputElement;
        if (document.activeElement !== input) input.focus({ preventScroll: true });
      } else {
        selection.toggle(id);
        anchor.current = id;
      }
    },
    [],
  );

  // Tab / Shift+Tab from the last / first tab stop of a row go to the next / previous ROW, as in the Free
  // table, even when that row is not mounted next to it (the focused row is pinned far from the range):
  // the row is scrolled into view, rendered, then focused. Without this the browser would jump to the
  // first mounted row after the spacer.
  const moveAcrossRows = (event: KeyboardEvent<HTMLDivElement>): boolean => {
    const target = event.target as HTMLElement;
    const row = target.closest('tbody > tr[aria-rowindex]');
    if (!row) return false;
    const index = Number(row.getAttribute('aria-rowindex')) - 2;
    const step = event.shiftKey ? -1 : 1;
    const next = index + step;
    if (!Number.isInteger(index) || next < 0 || next >= count) return false;
    const sibling = step > 0 ? row.nextElementSibling : row.previousElementSibling;
    if (sibling?.getAttribute('aria-rowindex') === String(next + 2)) return false; // mounted next to it: native order
    const stops = tabStops(row);
    if (target !== (step > 0 ? stops.at(-1) : stops[0])) return false; // still inside the row
    const el = scrollerRef.current;
    if (!el) return false;
    event.preventDefault();
    flushSync(() => {
      scrollToIndex(next, 'auto');
    });
    const nextRow = el.querySelector(`tbody > tr[aria-rowindex="${next + 2}"]`);
    const nextStops = nextRow ? tabStops(nextRow) : [];
    const focusTarget = step > 0 ? nextStops[0] : nextStops.at(-1);
    (focusTarget ?? el).focus({ preventScroll: true });
    return true;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.key === ' ' && event.shiftKey && isRowCheckbox(event.target)) {
      shiftSpace.current = true;
    } else if (event.key !== 'Shift') {
      shiftSpace.current = false;
    }
    if (event.key === 'Tab' && virtual && !event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey) moveAcrossRows(event);
  };

  // Escape inside the table empties a non-empty selection, and only then stops the event. A parent
  // Dialog (Radix) listens on `document` in the capture phase, before any handler of the table, so the
  // listener is on `window`, capture phase — attached only while something is selected: with an empty
  // selection Escape is not even seen here and goes on (the Dialog closes as usual).
  const hasSelection = selection.enabled && selection.selectedIds.size > 0;
  const clearSelection = useRef(selection.clearSelection);
  clearSelection.current = selection.clearSelection;
  useEffect(() => {
    if (!hasSelection) return undefined;
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      const el = scrollerRef.current;
      if (!el || !(event.target instanceof Node) || !el.contains(event.target)) return;
      clearSelection.current();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, [hasSelection]);

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    onMouseDown?.(event);
    shiftSpace.current = false;
    // A shift-click would extend the page's text selection across the rows: cancel the default.
    if (event.shiftKey && isRowCheckbox(event.target)) event.preventDefault();
  };

  // --- `truncate: false` cannot grow a fixed-pitch row --------------------------------------------
  const warned = useRef(new Set<string>());
  useEffect(() => {
    if (!virtual || !isDev()) return;
    for (const column of table.columns) {
      if (column.truncate === false && !warned.current.has(column.id)) {
        warned.current.add(column.id);
        console.warn(
          `[react-object-page] <VirtualListReportTable>: column "${column.id}" sets \`truncate: false\`, which a virtualized table does not support (fixed row height): its cells are truncated.`,
        );
      }
    }
  }, [virtual, table.columns]);

  // --- Imperative API -----------------------------------------------------------------------------
  const latest = useRef({ virtual, indexOfResult, scrollToIndex });
  latest.current = { virtual, indexOfResult, scrollToIndex };
  useImperativeHandle(
    handleRef,
    () => ({
      scrollToRowId(id, options) {
        const { virtual: v, indexOfResult: indexOf, scrollToIndex: toIndex } = latest.current;
        const index = indexOf(id);
        if (index < 0) return false;
        const align = options?.align ?? 'auto';
        if (v) return toIndex(index, align);
        // Not virtualized: every row is mounted, measure the real one (same rules: below the sticky
        // header, only the container scrolls, never the page).
        const el = scrollerRef.current;
        const row = el?.querySelector('tbody')?.rows[index];
        if (!el || !row) return false;
        const rect = row.getBoundingClientRect();
        const next = scrollTopForIndex({
          index: 0,
          pitch: rect.height,
          bodyStart: rect.top - el.getBoundingClientRect().top - el.clientTop + el.scrollTop,
          stickyHeight: el.querySelector('thead')?.getBoundingClientRect().height ?? 0,
          clientHeight: el.clientHeight,
          scrollTop: el.scrollTop,
          align,
        });
        if (next !== null) el.scrollTop = next;
        return true;
      },
    }),
    [],
  );

  // --- Rendering ----------------------------------------------------------------------------------
  // `rowProps` per id, so a row that stays mounted across a range change receives the same object and
  // `ListReportTableRow` can skip its render. Rebuilt on every body pass from the ids actually rendered,
  // so it never holds more than the mounted rows. An entry is reused only while its `aria-rowindex`
  // (absent when not virtualized) is the one the row needs.
  const rowPropsCache = useRef<RowPropsById>(new Map());
  const renderRow = (ctx: ListReportTableBodyContext<Row>, index: number, nextRowProps: RowPropsById): ReactNode => {
    const row = ctx.table.rows[index]!;
    const id = ctx.table.getRowId(row);
    let cached = rowPropsCache.current.get(id);
    if (!cached || cached['aria-rowindex'] !== (virtual ? index + 2 : undefined)) {
      cached = {
        onFocus: () => onRowFocus(id),
        onBlur: (event) => onRowBlur(id, event),
        ...(virtual && { 'aria-rowindex': index + 2, className: VIRTUAL_ROW_CLASS }),
      };
    }
    nextRowProps.set(id, cached);
    return (
      <ListReportTableRow
        key={id}
        table={ctx.table}
        row={row}
        selectable={ctx.selectable}
        labels={ctx.labels}
        rowProps={cached}
        onToggle={ctx.selectable ? onToggle : undefined}
        renderCellOptions={virtual ? FORCE_TRUNCATE : undefined}
      />
    );
  };

  // One flat keyed list in both modes: crossing the threshold keeps every row's DOM node (and the focus).
  const renderBody = (ctx: ListReportTableBodyContext<Row>): ReactNode => {
    const children: ReactNode[] = [];
    const nextRowProps: RowPropsById = new Map();
    if (!virtual) {
      for (let i = 0; i < count; i++) children.push(renderRow(ctx, i, nextRowProps));
    } else {
      for (const segment of segments) {
        if (segment.type === 'rows') {
          for (let i = segment.start; i < segment.end; i++) children.push(renderRow(ctx, i, nextRowProps));
        } else {
          children.push(
            <tr key={`rop-spacer-${segment.key}`} aria-hidden="true" data-rop-spacer="">
              <td colSpan={Math.max(1, ctx.columnCount)} style={{ height: spacerHeight(segment.rows), padding: 0, border: 0 }} />
            </tr>,
          );
        }
      }
    }
    children.push(<Filler key="rop-filler" columnCount={ctx.columnCount} rows={ctx.minRows - count} />);
    rowPropsCache.current = nextRowProps;
    return children;
  };

  const containerStyle: CSSProperties | undefined = virtual ? { overflowAnchor: 'none', ...style } : style;

  return (
    <ListReportTableShell
      {...shellProps}
      ref={mergedRef}
      style={containerStyle}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      tableProps={virtual ? { 'aria-rowcount': table.resultCount + 1 } : undefined}
      headRowProps={virtual ? { 'aria-rowindex': 1 } : undefined}
      renderBody={renderBody}
    />
  );
}

/**
 * The List Report table of `@react-object-page/core` (`ListReportTable`) with **virtualized rows**:
 * same props, same `table` (`useListReport`), same DOM per row, same states and same selection, but
 * only the rows in the viewport (+ `overscan`) are mounted, for client-side datasets of 10⁴–10⁵ rows.
 *
 * - Below `virtualizeThreshold` (default 200), with no rows and in the loading/empty/no-results/error
 *   states it **is** the Free table (identical DOM) and no virtualizer is attached.
 * - A native `<table>` with spacer rows (`<tr aria-hidden data-rop-spacer>`) above/below the mounted
 *   ones: sticky header, `<colgroup>`, widths, horizontal scroll and cells are the Free ones. When
 *   virtualized the `<table>` has `aria-rowcount` (results + 1) and every row `aria-rowindex` (header = 1).
 * - **Fixed row height**: the pitch is measured from a real row and re-measured when it changes
 *   (`--rop-list-report-row-height` overridden, zoom, font size). `truncate: false` is not supported
 *   when virtualized (warning in development, cells truncated), and `node` cells are capped at the
 *   row height — this needs the Pro `styles.css`.
 * - **Focus is never lost**: the row holding it stays mounted when it scrolls out of the range; a
 *   filter that removes it moves the focus to the scroll container. Tab / Shift+Tab go from a row to the
 *   next / previous one as in the Free table (a row that is not mounted is scrolled in first). The
 *   browser's find (Ctrl+F) does not see unmounted rows: use the List Report search. Arrow-key grid
 *   navigation is not provided.
 * - **Selection** (`useListReport({ selectable: true })`, the core model unchanged) gains a range
 *   gesture: shift-click or Shift+Space on a row checkbox applies, from the anchor (the last row changed
 *   with a plain gesture) to that row, the state the row gets — over the indices of the current results,
 *   so the anchor may be unmounted. One `onSelectedIdsChange` per gesture. The anchor is dropped when it
 *   leaves the results (a shift-click then acts as a plain click). Escape inside the table empties a
 *   non-empty selection (and only then stops the event: a parent Dialog still closes on an empty one).
 * - `ref` is the scroll container (works with `useListReportScrollRestoration().ref`); the imperative
 *   `scrollToRowId` is on `handleRef`.
 * - Declared ceiling: 200,000 rows at the default pitch (≈ 9.4M px of scroll height, under the
 *   browsers' maximum element height: ≈ 17.9M px in Firefox). Beyond that the scroll would need scaling,
 *   which is not provided.
 * - Server rendering: the first `ceil(800px / 47px) + overscan` rows with the bottom spacer already
 *   sized; the first client render is identical (measured afterwards), so hydration does not mismatch.
 */
export const VirtualListReportTable = /* @__PURE__ */ forwardRef(VirtualListReportTableImpl) as <Row>(
  props: VirtualListReportTableProps<Row> & { ref?: Ref<HTMLDivElement> },
) => ReactElement | null;
