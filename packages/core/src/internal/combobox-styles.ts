// Class strings of the Combobox, kept apart from `combobox/Combobox.tsx` because that file is
// excluded from the Tailwind scan (a prop named like a utility would generate it; see styles/index.css).
// Full literals: the CSS build scans the sources for utilities. The popover's own classes (surface,
// sizes, items) are shared with the Select in `listbox-styles.ts`.

// Same box as Input (32px / 36px); the text is clipped by the input itself, whose `max-w-full` /
// `min-w-0` keep a long label from widening the Field.
export const COMBOBOX_INPUT =
  'block max-w-full min-w-0 rounded-rop-md border border-rop-border bg-rop-surface px-3 font-rop-sans text-rop-body text-rop-text ' +
  'placeholder:text-rop-text-muted focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2 ' +
  'read-only:bg-rop-readonly-surface read-only:not-disabled:border-dashed disabled:cursor-not-allowed disabled:opacity-50';

export const COMBOBOX_SIZE = {
  sm: 'py-[5px]',
  md: 'py-[7px]',
} as const;

/** The popover anchor: a stretched flex item like the Input, so the list is as wide as the input. */
export const COMBOBOX_ANCHOR = 'flex min-w-0 max-w-full flex-col';

/** The list inside the panel: shrinks with the panel's max height (the panel is a flex column). */
export const COMBOBOX_LIST = 'min-h-0';

/** Long labels in the list wrap anywhere instead of overflowing. */
export const COMBOBOX_OPTION = '[overflow-wrap:anywhere]';

/** The always-mounted live region that announces the "no results" state (visually hidden, not `display: none`). */
export const COMBOBOX_STATUS = 'sr-only';
