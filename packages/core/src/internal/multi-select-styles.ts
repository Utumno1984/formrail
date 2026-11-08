// Class strings of the MultiSelect, kept apart from `multi-select/MultiSelect.tsx` because that file
// is excluded from the Tailwind scan (a prop named like a utility would generate it; see
// styles/index.css). Full literals: the CSS build scans the sources for utilities. The popover and
// its options are the Combobox's (`listbox-styles.ts`, `combobox-styles.ts`).

/**
 * The visible box (border, surface, focus ring) is the wrapper of the chips and the text input,
 * not the input: the states come from data attributes the component sets from the input's own
 * resolved state. Same paddings, border and line height as the Combobox's input, so an empty
 * MultiSelect is exactly as tall as a Combobox of the same size.
 */
export const MULTI_SELECT_BOX =
  'flex min-w-0 max-w-full cursor-text flex-wrap items-center gap-1 rounded-rop-md border border-rop-border bg-rop-surface px-3 ' +
  'font-rop-sans text-rop-body text-rop-text has-[input:focus-visible]:[outline:2px_solid_var(--color-rop-primary)] has-[input:focus-visible]:outline-offset-2 ' +
  'data-[readonly]:bg-rop-readonly-surface data-[readonly]:not-data-[disabled]:border-dashed data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 ' +
  'data-[invalid]:border-rop-error';

export const MULTI_SELECT_SIZE = {
  sm: 'py-[5px]',
  md: 'py-[7px]',
} as const;

/** The text input inside the box: no box of its own, it takes the rest of the last row (at least 4rem). */
export const MULTI_SELECT_INPUT =
  'm-0 block min-w-16 max-w-full grow basis-16 border-0 bg-transparent p-0 font-rop-sans text-rop-body text-rop-text outline-none ' +
  'placeholder:text-rop-text-muted disabled:cursor-not-allowed';

/**
 * One chip: one body line tall at most (caption text + 1px padding + 1px border = 20px), so a row of
 * chips is as tall as a row of text. `max-w-full` + `min-w-0` are the real width constraint that lets
 * the label inside truncate.
 */
export const MULTI_SELECT_CHIP =
  'inline-flex min-w-0 max-w-full items-center gap-0.5 rounded-rop-sm border border-rop-border-subtle bg-rop-surface-subtle py-px ps-1.5 pe-0.5 ' +
  'text-rop-caption text-rop-text';

/** A chip without a remove button (disabled, forced, locked): the same box, symmetric padding. */
export const MULTI_SELECT_CHIP_STATIC = 'pe-1.5';

/** The chip's remove button: 16px, pointer/touch only (`tabIndex={-1}`). */
export const MULTI_SELECT_CHIP_REMOVE =
  'm-0 flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-rop-sm border-0 bg-transparent p-0 text-rop-text-muted ' +
  'rop-hover:bg-rop-border-subtle active:bg-rop-surface-pressed';

/** Visually hidden nodes (the list of the selected labels, the live region). */
export const MULTI_SELECT_SR_ONLY = 'sr-only';
