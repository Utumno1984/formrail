// Class names of ListReport, kept apart from its logic. Full literals on purpose, and no bare utility
// name in a comment (the CSS build scans the sources, comments included).

// A flex column that takes the height of its parent: the full height is the parent's when it has one,
// the content height when it does not (the page then scrolls and the layout never collapses to zero).
// The zero minimum height lets the table container shrink and scroll instead of pushing the page.
export const rootClass = 'flex h-full min-h-0 min-w-0 max-w-full flex-col gap-3 font-rop-sans text-rop-body text-rop-text';

// Title above, actions below on a narrow screen; side by side from 640px.
export const headerClass = 'flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4';

export const titleClass = 'min-w-0 [overflow-wrap:anywhere]';

// Invisible (not removed) while there is no count to show: the header keeps the same box.
// A small pill (token background, border and radius). The background transition reads the motion token
// and is switched off by `motion-reduce` (prefers-reduced-motion).
export const countClass =
  'inline-block rounded-rop-sm border border-rop-border bg-rop-surface-subtle px-1.5 font-normal text-rop-text-muted transition-[background-color,border-color] duration-[var(--motion-rop-feedback-duration)] ease-[var(--motion-rop-feedback-easing)] motion-reduce:transition-none';
// While the value just changed: a stronger tone, which the transition above eases in and out. With
// reduced motion the pill keeps its resting tone (the new value simply appears).
// (primary-subtle keeps the muted text above 4.5:1 while the flash lasts.)
export const countFlashClass = 'bg-rop-primary-subtle border-rop-primary-muted motion-reduce:bg-rop-surface-subtle motion-reduce:border-rop-border';
export const countHiddenClass = 'invisible';

export const actionsClass = 'flex min-w-0 flex-wrap items-center gap-2';

export const filterBarClass = 'shrink-0';

// The one scroller: it takes what is left of the column (and, without a bounded parent, the height of
// its rows).
export const tableClass = 'min-h-0 flex-1';

// Selection bar (only with `selection.enabled`): always mounted, below the bar of pills and search, above the table.
// Its height never depends on the selection: the count is one truncated line whose basis is zero (its
// length never moves the actions), the "clear" button keeps its box while hidden and the bulk actions are
// always rendered. Wide: count, actions, "clear" on one line. Narrow (below 640px) with `bulkActions`: the
// count on its own line, then the actions and "clear" at the end — two lines at 0 and at n alike. Narrow
// without `bulkActions` (`data-rop-bulk-actions="false"`, decided at render): count and "clear" on one
// line, the count yields. DOM order = visual order.
export const selectionBarClass =
  'group flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-rop-md border border-rop-border bg-rop-surface-subtle ' +
  'px-3 py-1 data-[rop-bulk-actions=false]:flex-nowrap sm:flex-nowrap';
export const selectionCountClass =
  'min-w-0 basis-full text-rop-text group-data-[rop-bulk-actions=false]:flex-1 group-data-[rop-bulk-actions=false]:basis-0 sm:flex-1 sm:basis-0';
export const selectionActionsClass = 'flex min-w-0 flex-wrap items-center gap-2';
export const selectionClearClass = 'ms-auto shrink-0 whitespace-nowrap';
