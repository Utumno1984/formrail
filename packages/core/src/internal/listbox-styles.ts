// Class strings of a popover listbox (the Select today, the Combobox later). Full literals: the
// CSS build scans the sources for utilities. No z-index here: the stacking level is the caller's
// (`overlayLayer.popover`), applied on the same element at mount (see `overlay/layers.ts`).
// The library ships no box-sizing reset (boxes are content-box): paddings and borders add to the
// declared sizes, which is why the widths below are `min-w` / `max-w` only.

/** The positioned panel, never taller or wider than the room the viewport leaves. */
export const LISTBOX_CONTENT =
  'min-w-(--radix-select-trigger-width) max-w-(--radix-select-content-available-width) max-h-(--radix-select-content-available-height) ' +
  'overflow-hidden rounded-rop-md border border-rop-border bg-rop-surface font-rop-sans text-rop-body text-rop-text ' +
  '[box-shadow:0_4px_16px_rgb(0_0_0/0.2)]';

/**
 * The Combobox's panel (a Popover anchored to the input): same box as the Select's, the Popover's
 * size variables, and a flex column so the list inside shrinks with the panel's max height. A full
 * literal, not a concatenation: a string built with a variable is not tree-shaken from other imports.
 */
export const LISTBOX_CONTENT_POPOVER =
  'min-w-(--radix-popover-trigger-width) max-w-(--radix-popover-content-available-width) max-h-(--radix-popover-content-available-height) ' +
  'flex flex-col overflow-hidden rounded-rop-md border border-rop-border bg-rop-surface font-rop-sans text-rop-body text-rop-text ' +
  '[box-shadow:0_4px_16px_rgb(0_0_0/0.2)]';

/** The scroll container: at most 20rem tall and 24rem wide, the list scrolls here, never the page. */
export const LISTBOX_VIEWPORT = 'max-h-80 max-w-96 overflow-y-auto p-1';

/** One option. The check sits in the start padding so labels stay aligned. */
export const LISTBOX_ITEM =
  'relative flex min-w-0 cursor-pointer select-none items-center rounded-rop-md py-1.5 ps-8 pe-3 outline-none ' +
  'data-[highlighted]:bg-rop-surface-subtle not-data-[disabled]:data-[highlighted]:active:bg-rop-surface-pressed ' +
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50';

/** The slot of the selected-option check. */
export const LISTBOX_ITEM_INDICATOR = 'absolute start-2 inline-flex items-center';

/** The text shown instead of options when there are none. */
export const LISTBOX_EMPTY = 'px-3 py-1.5 text-rop-text-muted';
