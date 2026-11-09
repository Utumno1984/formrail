// Class shared by every form control that a `Field` can mark invalid (Input, Select, Combobox).
// A full literal: the CSS build scans the sources for utilities, and this file is scanned (unlike
// `combobox/Combobox.tsx`). Pass it to `cn(...)` at render time, never concatenate it into a
// top-level class string: a `"..." + CONST` is not tree-shakable, so it would stay in every
// per-import bundle (bundle budget).

/** The border of a control carrying `aria-invalid`. */
export const CONTROL_INVALID = 'aria-invalid:border-rop-error';

// Box of the text controls (Input, Textarea). The library ships no preflight (boxes are content-box)
// and a guard forbids a box-sizing reset: so no `w-full` / `h-*` here, which padding would push past
// the Field. The width is the one the Field's column gives it (a stretched flex item). The keyboard
// focus indicator is the same arbitrary declaration as in Button. Vertical padding is the caller's.
/** Shared box of `Input` and `Textarea`: border, radius, horizontal padding, type, focus ring, read-only look. */
export const TEXT_CONTROL_BOX =
  'block max-w-full min-w-0 rounded-rop-md border border-rop-border bg-rop-surface px-3 font-rop-sans text-rop-body text-rop-text ' +
  'placeholder:text-rop-text-muted focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2 ' +
  'read-only:bg-rop-readonly-surface read-only:not-disabled:border-dashed disabled:cursor-not-allowed disabled:opacity-50';
