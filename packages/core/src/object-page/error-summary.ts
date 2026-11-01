import { invalidPaths } from './field-errors';
import type { FieldErrors } from './field-errors';

export interface GetErrorSummaryOptions {
  /**
   * Root-level messages (`useObjectPageForm().formErrors`): each one adds one to the count. Omit it
   * to count the field errors only.
   */
  formErrors?: readonly string[];
  /**
   * Builds the text from the count (always `>= 1`: it is never called without errors). The library
   * does not translate: pass your own text, e.g.
   * `(n) => (n === 1 ? '1 invalid field' : n + ' invalid fields')`. Default (Italian):
   * "1 campo non valido" / "N campi non validi".
   */
  message?: (count: number) => string;
}

const defaultMessage = (count: number) => (count === 1 ? '1 campo non valido' : `${count} campi non validi`);

/**
 * The one-line validation summary for `ObjectPageFooter`'s `message` ("3 campi non validi"), or
 * `undefined` when there is nothing to report, so the footer shows no message.
 *
 * The count is the number of invalid paths of `fieldErrors` (the keys whose value is not
 * `undefined`: the same rule as the form and `ValidationProvider`, so an empty message counts) plus
 * the number of `options.formErrors`. Only the count: never the field messages, which belong to the
 * fields. Every invalid path counts, also one with no control on the page and one whose `Field` is
 * `forced`/`locked`/`disabled` (that the focus cannot reach).
 *
 * A pure function of its arguments, nothing to memoize. The footer stays presentational: it does
 * not read the form, the consumer passes it the summary. When a `saveError` is present, show that
 * instead (see the announcement rule on `ObjectPageFooter`):
 *
 * ```tsx
 * message={saveErrorText ?? getErrorSummary(form.fieldErrors, { formErrors: form.formErrors })}
 * messageTone="error"
 * ```
 */
export function getErrorSummary(fieldErrors: FieldErrors, options: GetErrorSummaryOptions = {}): string | undefined {
  const count = invalidPaths(fieldErrors).length + (options.formErrors?.length ?? 0);
  if (count === 0) return undefined;
  return (options.message ?? defaultMessage)(count);
}
