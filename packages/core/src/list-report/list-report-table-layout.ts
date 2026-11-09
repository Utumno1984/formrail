import type { ListReportColumn } from './types';

const DEFAULT_MIN_WIDTH = 120;

export const toCss = (value: number | string): string => (typeof value === 'number' ? `${value}px` : value.trim());
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
export function tableSize<Row>(
  columns: readonly ListReportColumn<Row>[],
  lead?: string,
  trail?: string,
): { width: string; minWidth: string } {
  let px = 0;
  // `lead`/`trail`: the widths of the selection column and of the row actions column, fixed CSS
  // lengths counted like any declared width.
  const structural = [lead, trail].filter((width): width is string => !!width);
  const other: string[] = [...structural];
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
  const fixedOther: string[] = [...structural];
  let share = 0;
  for (const column of columns) {
    if (isPercent(column.width)) share += Number.parseFloat(column.width as string) / 100;
    else if (pixels(column.width) !== null) fixedPx += pixels(column.width) as number;
    else fixedOther.push(toCss(column.width as string));
  }
  if (share >= 1 || (fixedPx === 0 && fixedOther.length === structural.length)) return { minWidth, width: '100%' };
  const absolute = sum(fixedPx, fixedOther);
  const total = share === 0 ? absolute : `calc(${absolute} / ${1 - share})`;
  return { minWidth: total, width: total };
}
