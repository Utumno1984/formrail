// Class shared by every form control that a `Field` can mark invalid (Input, Select, Combobox).
// A full literal: the CSS build scans the sources for utilities, and this file is scanned (unlike
// `combobox/Combobox.tsx`). Pass it to `cn(...)` at render time, never concatenate it into a
// top-level class string: a `"..." + CONST` is not tree-shakable, so it would stay in every
// per-import bundle (bundle budget).

/** The border of a control carrying `aria-invalid`. */
export const CONTROL_INVALID = 'aria-invalid:border-rop-error';
