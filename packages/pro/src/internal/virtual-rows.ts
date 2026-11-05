// Fixed-pitch row virtualization, pure (no React, no DOM).
//
// Provenance: `computeRange` is a port of `computeRange` in react-virtual-tree-view
// (`src/useVirtualRows.ts`, MIT License, Copyright (c) 2026 Daniele Ingusci — same author), adapted
// for a `<table>` body: the range is laid out as spacer `<tr>`s around the mounted rows, with one
// optional "pinned" row (the one holding the focus) kept mounted outside the range. Nothing is
// imported from `react-virtual-*` (decision D1 of #231): moving to a public package later must be a
// change of import on this module only.

export interface VirtualRange {
  /** Index of the first mounted row (inclusive). */
  start: number;
  /** Index after the last mounted row (exclusive). */
  end: number;
}

/**
 * Rows to mount for a fixed-pitch list. O(1): the range comes from the scroll offset and the pitch
 * only, never from measuring rows.
 *
 * - `scrollTop`: offset of the visible area from the top of the FIRST ROW (header already
 *   subtracted by the caller), in px; fractional values are fine.
 * - `viewportHeight`: height of the visible area of the rows (under a sticky header), in px.
 * - `pitch`: height of one row, in px (may be fractional).
 *
 * With `overscan >= 1` the range never exceeds `ceil(viewportHeight / pitch) + 2 * overscan` rows,
 * even when the scroll position is not row-aligned (the partially visible row takes the place of
 * one overscan row). With `overscan = 0` an unaligned scroll needs one extra row to avoid an
 * uncovered strip. A viewport (or pitch) of 0 or less — not measured yet — mounts every row: the
 * caller never passes one in the browser (it starts from a default viewport).
 *
 * A stale `scrollTop` beyond the end (the list just got shorter, before the browser's own clamp)
 * is clamped: never an exception, never an empty range for a non-empty list.
 */
export function computeRange(
  scrollTop: number,
  viewportHeight: number,
  pitch: number,
  overscan: number,
  count: number,
): VirtualRange {
  if (!(count > 0)) return { start: 0, end: 0 };
  if (!(viewportHeight > 0) || !(pitch > 0)) return { start: 0, end: count };
  const over = Number.isFinite(overscan) ? Math.max(0, Math.floor(overscan)) : 0;
  const top = Math.min(Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0), Math.max(0, count * pitch - viewportHeight));
  const first = Math.floor(top / pitch);
  const last = Math.ceil((top + viewportHeight) / pitch);
  const start = Math.min(count, Math.max(0, first - over));
  const cap = start + Math.ceil(viewportHeight / pitch) + 2 * over;
  const wanted = over >= 1 ? Math.min(last + over, cap) : last;
  const end = Math.min(count, Math.max(start, wanted));
  // The clamp above keeps `first < count`, so a non-empty list always mounts at least one row.
  return { start, end };
}

/** One piece of the table body, in document order. */
export type VirtualSegment =
  | { type: 'spacer'; key: 'top' | 'mid' | 'bottom'; rows: number }
  | { type: 'rows'; start: number; end: number };

/**
 * The body as an ordered list of spacers and row runs: `[top spacer] [pinned row?] [mid spacer?]
 * [range] [bottom spacer]` (or the pinned row after the range when it is below it). Spacers of 0
 * rows are left out. `pinned` is the index of a row that must stay mounted (it holds the focus):
 * ignored when it is inside the range or not a valid index.
 *
 * The rows covered by the returned segments always add up to `count`.
 */
export function layoutSegments(range: VirtualRange, count: number, pinned: number | null | undefined): VirtualSegment[] {
  const total = Math.max(0, Math.floor(count));
  const start = Math.min(Math.max(0, range.start), total);
  const end = Math.min(Math.max(start, range.end), total);
  const segments: VirtualSegment[] = [];
  const spacer = (key: 'top' | 'mid' | 'bottom', rows: number) => {
    if (rows > 0) segments.push({ type: 'spacer', key, rows });
  };
  const runs = (s: number, e: number) => {
    if (e > s) segments.push({ type: 'rows', start: s, end: e });
  };
  const pin = pinned !== null && pinned !== undefined && Number.isInteger(pinned) && pinned >= 0 && pinned < total ? pinned : null;

  if (pin !== null && pin < start) {
    spacer('top', pin);
    runs(pin, pin + 1);
    spacer('mid', start - pin - 1);
    runs(start, end);
    spacer('bottom', total - end);
  } else if (pin !== null && pin >= end) {
    spacer('top', start);
    runs(start, end);
    spacer('mid', pin - end);
    runs(pin, pin + 1);
    spacer('bottom', total - pin - 1);
  } else {
    spacer('top', start);
    runs(start, end);
    spacer('bottom', total - end);
  }
  return segments;
}

/** True when the two ranges mount the same rows. */
export function sameRange(a: VirtualRange, b: VirtualRange): boolean {
  return a.start === b.start && a.end === b.end;
}

export type ScrollAlign = 'auto' | 'start' | 'center' | 'end';

/**
 * The `scrollTop` that shows row `index` in the visible area of the body, or `null` when no scroll is
 * needed (`auto` and the row is already fully visible).
 *
 * - `bodyStart`: offset of the first row from the top of the scroll content (header height, usually).
 * - `stickyHeight`: height covered at the top of the viewport by the sticky header.
 * - `auto`: minimal scroll so the row is fully visible under the sticky header.
 * - `start`/`center`/`end`: relative to the visible area of the body (below the header).
 * The result is not clamped to the scrollable range: the browser does it on assignment.
 */
export function scrollTopForIndex(args: {
  index: number;
  pitch: number;
  bodyStart: number;
  stickyHeight: number;
  clientHeight: number;
  scrollTop: number;
  align: ScrollAlign;
}): number | null {
  const { index, pitch, bodyStart, stickyHeight, clientHeight, scrollTop, align } = args;
  const rowTop = bodyStart + index * pitch;
  const rowBottom = rowTop + pitch;
  const area = Math.max(0, clientHeight - stickyHeight);
  const toStart = rowTop - stickyHeight;
  const toEnd = rowBottom - clientHeight;
  let next: number;
  if (align === 'start') next = toStart;
  else if (align === 'end') next = toEnd;
  else if (align === 'center') next = rowTop + pitch / 2 - stickyHeight - area / 2;
  else if (rowTop < scrollTop + stickyHeight) next = toStart;
  else if (rowBottom > scrollTop + clientHeight) next = toEnd;
  else return null;
  return Math.max(0, next);
}
