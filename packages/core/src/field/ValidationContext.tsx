import { createContext, type ReactNode } from 'react';
import type { FieldErrors } from '../object-page/field-errors';

/** `null` outside a `ValidationProvider`. The value is the `fieldErrors` object itself. */
export const ValidationContext = /* @__PURE__ */ createContext<FieldErrors | null>(null);

export interface ValidationProviderProps {
  /**
   * Errors keyed by dot-notation path (`FieldErrors`), e.g. `useObjectPageForm().fieldErrors`, or any
   * object of the same shape. Pass it as is: its identity is the context value, so it changes only
   * when this object does.
   */
  fieldErrors: FieldErrors;
  children?: ReactNode;
}

/**
 * Hands `fieldErrors` to every `Field` below it: a `Field` with a `name` shows
 * `fieldErrors[name]` as its error (same rendering as the `error` prop: `aria-invalid`, the error
 * message, its id in `aria-describedby`), so the key is written once, as `name`.
 *
 * - The lookup is by exact path (`address.city` never sees `address` nor `address.city.zip`); an
 *   absent key or `undefined` means no error. "Invalid" is the form's rule (any value other than
 *   `undefined`): an empty or blank message still sets `aria-invalid`, but renders no message node
 *   (so no id in `aria-describedby`) and logs a `console.error` in development: always give a text.
 * - Wrap only the Fields of this form: any `Field` with a matching `name` below the provider, even
 *   an unrelated one, reads its error.
 * - A `Field` `error` with content wins over the provider; an empty or absent `error` falls back
 *   to it. A `Field` without `name`, or outside any provider, ignores it.
 * - Nested providers: the innermost is the only source (no merge with the outer ones).
 * - Every `Field` below re-renders when the `fieldErrors` object changes identity (whatever path
 *   changed), as with any React context; nothing re-renders while it keeps the same identity.
 *
 * Renders no DOM of its own and does not depend on `useObjectPageForm`.
 */
export function ValidationProvider({ fieldErrors, children }: ValidationProviderProps) {
  return <ValidationContext.Provider value={fieldErrors}>{children}</ValidationContext.Provider>;
}
