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

// Objects produced by removing paths from a previous result (a user edit), not by a new
// validation. `useFocusFirstInvalidField` ignores them: a clearing must never move the focus.
// Internal: a WeakSet keyed by identity, so the public `FieldErrors` type stays a plain record.
const CLEARINGS = /* @__PURE__ */ new WeakSet<FieldErrors>();

/**
 * Returns `errors` without each path that is one of `names` or a descendant of one (`name.x`,
 * `name.0.y`; never an ancestor, never a sibling sharing a prefix such as `name1`). Returns `errors`
 * itself when nothing is removed (same identity: no re-render). The new object, possibly empty, is
 * marked as a clearing (`isClearing`).
 */
export function withoutPaths(errors: FieldErrors, names: readonly string[]): FieldErrors {
  const next: Record<string, string | undefined> = {};
  let removed = false;
  for (const path in errors) {
    if (names.some((name) => path === name || path.startsWith(name + '.'))) removed = true;
    else next[path] = errors[path];
  }
  if (!removed) return errors;
  CLEARINGS.add(next);
  return next;
}

/** `true` for an object built by `withoutPaths` (a partial clearing, not a validation result). */
export function isClearing(errors: FieldErrors): boolean {
  return CLEARINGS.has(errors);
}
