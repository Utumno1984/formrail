/** One slot of the pagination: a page number, or one of the two ellipses. */
export type PaginationItem = number | 'start-ellipsis' | 'end-ellipsis';

export interface PaginationRangeInput {
  /** Current page, already normalized (integer in `1..pageCount`). */
  page: number;
  /** Total pages, already normalized (integer >= 1). */
  pageCount: number;
  /** Pages shown on each side of the current one. */
  siblingCount: number;
  /** Pages always shown at each end. */
  boundaryCount: number;
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

/** Number of slots (numbers + ellipses) once `pageCount` exceeds it. */
export const paginationSlotCount = (siblingCount: number, boundaryCount: number): number =>
  2 * boundaryCount + 2 * siblingCount + 3;

/**
 * Pure: the list of slots to render. When `pageCount` fits in `paginationSlotCount` every page is
 * listed; otherwise the list ALWAYS has exactly that many slots, whatever `page` is (an ellipsis
 * that would hide a single page shows that page instead), so the control never changes width or
 * moves buttons while paging.
 */
export function getPaginationRange({
  page,
  pageCount,
  siblingCount,
  boundaryCount,
}: PaginationRangeInput): PaginationItem[] {
  if (pageCount <= paginationSlotCount(siblingCount, boundaryCount)) return range(1, pageCount);

  const startPages = range(1, boundaryCount);
  const endPages = range(pageCount - boundaryCount + 1, pageCount);

  const siblingsStart = Math.max(
    Math.min(page - siblingCount, pageCount - boundaryCount - siblingCount * 2 - 1),
    boundaryCount + 2,
  );
  const siblingsEnd = Math.min(
    Math.max(page + siblingCount, boundaryCount + siblingCount * 2 + 2),
    pageCount - boundaryCount - 1,
  );

  const startFiller: PaginationItem[] = siblingsStart > boundaryCount + 2 ? ['start-ellipsis'] : [boundaryCount + 1];
  const endFiller: PaginationItem[] =
    siblingsEnd < pageCount - boundaryCount - 1 ? ['end-ellipsis'] : [pageCount - boundaryCount];

  return [...startPages, ...startFiller, ...range(siblingsStart, siblingsEnd), ...endFiller, ...endPages];
}

/** Integer >= `min`; anything else (NaN, Infinity, non-number) becomes `fallback`. */
export function toInt(value: unknown, fallback: number, min: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.floor(value));
}
