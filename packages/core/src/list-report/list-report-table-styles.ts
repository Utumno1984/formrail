// Class names of ListReportTable, kept apart from its logic. Full literals on purpose: the CSS build
// scans the sources (comments included) for utilities, so no bare utility name appears in a comment.
// Logical properties (`text-start`, `justify-start`) so that `dir="rtl"` mirrors the layout.
// The row height is a component-owned CSS variable (`--rop-list-report-row-height`), declared on the
// scroll container so that everything inside it (the loading/empty states of the List Report, which
// must have the same footprint) reads the same value; a consumer overrides it with `style` or
// `className` on that container. Cells carry a 1px border on top of it, with the default
// content-box sizing: the row pitch is constant.
export const ROW_HEIGHT_CLASS = 'h-(--rop-list-report-row-height)';

// The one scroller: the consumer sizes it (flex parent or `maxHeight`). Focusable so that a
// keyboard user can scroll it; `min-h-0` lets it shrink inside a flex column. The scroll padding equals
// the sticky header height: an element focused behind the header is still inside the scrollport, so the
// browser does not scroll it into view; the padding moves the snapport edge below the header.
export const containerClass =
  '[--rop-list-report-row-height:2.75rem] relative min-h-0 max-w-full scroll-pt-(--rop-list-report-row-height) overflow-auto font-rop-sans text-rop-body text-rop-text ' +
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2';

// Separate borders (not merged ones): cell borders and sticky cells behave with them.
export const tableClass = 'table-fixed border-separate border-spacing-0 text-start';

export const captionClass = 'sr-only';

// Plain literals, no template interpolation: a bundler cannot prove an interpolation pure, so it
// would keep these strings in the bundle of every export. The sticky level is the `stickyLayer` of
// the overlay scale (a unit test pins the two together).
export const headerCellClass =
  'sticky top-0 z-rop-sticky h-(--rop-list-report-row-height) overflow-hidden whitespace-nowrap border-b ' +
  'border-rop-border bg-rop-surface-subtle px-3 align-middle font-semibold text-rop-text';

// `py-px` is the user-agent padding of a cell, made explicit: a row is `height + 2px + 1px` tall
// (ROW_PITCH_EXTRA), and the state/filler cells of the loading, empty and error body are sized with it.
export const bodyCellClass =
  'h-(--rop-list-report-row-height) overflow-hidden border-b border-rop-border px-3 py-px align-middle';
export const ROW_PITCH_EXTRA_PX = 3;

// Content that is not plain text: its layout is up to the consumer, the cell only contains it.
export const nodeWrapperClass = 'min-w-0 overflow-hidden';

export const sortButtonClass =
  'flex w-full min-w-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-start [font:inherit] ' +
  'rounded-rop-sm text-inherit rop-hover:bg-rop-border/30 active:bg-rop-border/60 ' +
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2';

// The arrow always takes its space (no shift when a column becomes sorted): unsorted it is invisible.
export const sortIconClass = 'text-rop-text-muted';
export const sortIconIdleClass = 'opacity-0';
export const sortIconAscendingClass = 'rotate-180';

export const ALIGN_TEXT = {
  start: 'text-start',
  center: 'text-center',
  end: 'text-end',
} as const;

export const ALIGN_JUSTIFY = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
} as const;

// Stable states (loading / empty / no results / error). The body of every state is at least
// `rows x row height` tall. The message cell has no overflow clipping (a sticky child would then stick
// to the cell instead of the scroller) and no padding; its content is a sticky box as wide as the
// visible part of the scroller, so that in a wide, horizontally scrolled table the message stays
// in view instead of sitting in the middle of the whole table.
export const stateCellClass = 'border-b border-rop-border px-0 py-px align-middle';
export const fillerCellClass = 'px-0 py-px';
export const stateBoxClass =
  'sticky start-0 flex max-w-full flex-col items-center justify-center gap-3 p-4 text-center text-rop-text-muted';
export const stateStripClass = 'w-full max-w-prose text-start text-rop-text';
export const skeletonBarClass = 'block h-3 w-3/4 max-w-48 rounded-rop-md bg-rop-border';

// Selection column (only with `selection.enabled`): a square column as wide as a row is tall, the box
// centred in it. The header cell keeps the sticky classes of the other header cells.
export const SELECT_COLUMN_WIDTH = 'var(--rop-list-report-row-height)';
export const selectHeaderCellClass =
  'sticky top-0 z-rop-sticky h-(--rop-list-report-row-height) border-b border-rop-border bg-rop-surface-subtle px-0 align-middle';
export const selectBodyCellClass = 'h-(--rop-list-report-row-height) border-b border-rop-border px-0 py-px align-middle';
export const selectBoxClass = 'flex items-center justify-center';
// A selectable row: a subtle hover, and the selected tone (from the primary scale) with a stronger tone on
// hover. Pressing keeps the hover tone (no flicker while the checkbox is pressed). In forced colours the
// backgrounds are dropped and the checkbox alone carries the state.
export const selectableRowClass =
  'rop-hover:bg-rop-surface-subtle active:bg-rop-surface-subtle ' +
  'data-selected:bg-rop-blue-50 data-selected:rop-hover:bg-rop-blue-100 data-selected:active:bg-rop-blue-100';
