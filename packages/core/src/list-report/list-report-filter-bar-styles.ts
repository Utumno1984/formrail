// Class names of ListReportFilterBar, kept apart from its logic (some words in the component would be
// taken for utilities by the CSS build). Full literals on purpose, and no bare utility name in a
// comment. Logical properties so that the right-to-left direction mirrors the bar.

// Pills and search on one row from 640px up; below, the search takes the whole row and the pills wrap.
export const barClass = 'flex min-w-0 max-w-full flex-wrap items-end gap-x-3 gap-y-2 font-rop-sans text-rop-body text-rop-text';

export const groupClass = 'flex min-w-0 max-w-full flex-wrap gap-2';

// A pill is as wide as its label up to the width of the bar; a longer label wraps inside it.
// The checked one is solid.
export const pillClass =
  'inline-flex min-w-0 max-w-full cursor-pointer select-none items-center rounded-full border border-rop-border bg-rop-surface ' +
  'px-3 py-[5px] font-rop-sans text-rop-label text-rop-text not-aria-checked:rop-hover:bg-rop-surface-subtle ' +
  'not-aria-checked:active:bg-rop-surface-pressed aria-checked:active:bg-rop-primary-active ' +
  'aria-checked:border-rop-primary aria-checked:bg-rop-primary aria-checked:text-rop-primary-contrast ' +
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2';

// Optical centering comes from the shared `OpticalLabel` wrapper (same 1px offset as Button). Unlike
// Button, the label keeps the pill's 20px line height (no line-height 1): a long label wraps onto
// several lines and 14px lines would be cramped.
export const pillLabelClass = 'text-start [overflow-wrap:anywhere]';

export const searchFieldClass = 'w-full min-w-0 sm:w-72';

// A column, so that the input is a stretched flex item (the library has no box-sizing reset: no `w-full` on it).
export const searchBoxClass = 'relative flex min-w-0 flex-col';

// The native clear button of a search input is hidden: the system has its own, with a name.
export const searchInputClass =
  'pe-9 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none ' +
  '[&::-webkit-search-decoration]:appearance-none';

export const clearButtonClass = 'absolute inset-y-0 end-1 my-auto';
