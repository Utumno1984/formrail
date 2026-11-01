/**
 * Field-level errors keyed by **dot-notation path**: `supplier`, `address.city`, `lines.0.qty`.
 * Array indices are plain numbers in the path (`lines.0.qty`, never `lines[0].qty`). A value of
 * `undefined` means "no error" for that path. A path segment that itself contains a dot is not
 * supported in v1. Paths are compared by exact string equality (`lines.1` never matches
 * `lines.10.qty`), and are plain strings: they need not exist in the form `Values`.
 */
export type FieldErrors = Readonly<Record<string, string | undefined>>;

/** The single definition of "invalid": the keys whose value is not `undefined`. */
export function invalidPaths(errors: FieldErrors): string[] {
  return Object.keys(errors).filter((path) => errors[path] !== undefined);
}
