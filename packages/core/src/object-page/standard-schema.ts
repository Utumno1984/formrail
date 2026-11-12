import type { FieldErrors } from './field-errors';

/*
 * Structural subset of the Standard Schema v1 interface (https://standardschema.dev), declared here
 * as types only: the core depends on no schema library and on no `@standard-schema/spec` package.
 * Zod (>= 3.24 / 4), Valibot, ArkType and any hand-written object with this shape fit it.
 */

/** One path segment of a Standard Schema issue: a key, or an object wrapping it. */
export type StandardSchemaPathSegment =
  | PropertyKey
  | {
      /** The key of the segment. */
      readonly key: PropertyKey;
    };

/** One validation problem reported by a Standard Schema. An absent or empty `path` is the root. */
export interface StandardSchemaIssue {
  /** The text shown to the user (as the field error, or as a form error for the root). */
  readonly message: string;
  /** Where the problem is, from the root of the values (`['lines', 2, 'price']`). */
  readonly path?: ReadonlyArray<StandardSchemaPathSegment> | undefined;
}

/** Result of `~standard.validate`: success (no `issues`) or failure (`issues`). */
export type StandardSchemaResult =
  | {
      /** The validated (possibly transformed) value. */
      readonly value: unknown;
      /** Absent on success. */
      readonly issues?: undefined;
    }
  | {
      /** The problems found: the save is refused and they become field and form errors. */
      readonly issues: ReadonlyArray<StandardSchemaIssue>;
    };

/**
 * The only part of a Standard Schema that `useObjectPageForm` reads: `~standard.validate`. A Zod,
 * Valibot or ArkType schema is assignable as is. Validation is **synchronous** in v1: a `validate`
 * that returns a `Promise` is reported as a save error.
 */
export interface StandardSchemaLike {
  /** The Standard Schema v1 entry point; only `validate` is read. */
  readonly '~standard': {
    readonly validate: (value: unknown) => StandardSchemaResult | PromiseLike<StandardSchemaResult>;
  };
}

/** Errors produced by a failed schema: per-path field errors plus root-level (form) errors. */
export interface SchemaErrors {
  readonly fieldErrors: FieldErrors;
  readonly formErrors: readonly string[];
}

/**
 * Converts Standard Schema issues to the form's error model. Each path becomes a dot-notation
 * string (`address.city`, `lines.0.qty`; `{ key }` segments are unwrapped, numbers stay numbers,
 * symbols go through `String()`); for each path only the **first** message, in issue order, is
 * kept. Issues with an absent or empty path are root-level: they go to `formErrors`, in order.
 */
export function issuesToErrors(issues: ReadonlyArray<StandardSchemaIssue>): SchemaErrors {
  const fields = new Map<string, string>();
  const formErrors: string[] = [];
  for (const { message, path } of issues) {
    if (!path?.length) formErrors.push(message);
    else {
      // `{ key }` unwrapped (a primitive has no `key`); `String()`, not a template literal, because
      // it is the conversion that does not throw on a symbol.
      const key = path.map((s) => String((s as { key?: PropertyKey }).key ?? s)).join('.');
      if (!fields.has(key)) fields.set(key, message);
    }
  }
  // `fromEntries` defines own properties: a `__proto__` path stays a key, never a prototype.
  return { fieldErrors: Object.fromEntries(fields), formErrors };
}
