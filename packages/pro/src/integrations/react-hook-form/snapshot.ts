// Immutable snapshots of the values of a form library that mutates its own state in place (React Hook Form,
// ticket #507). Pure helpers, no React, no import from the form library or from the engines: the adapter entry
// bundles them, and they hold no module state (engine modules with state stay in `dist/engine.*`).

type Container = Record<string, unknown>;

/** A plain object: `{}` or `Object.create(null)`, the only objects a snapshot copies and descends into. */
export const isPlainRecord = (value: unknown): value is Container => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
};

/** Own enumerable string keys, in their order (symbols and non-enumerable keys are not part of a snapshot). */
const keysOf = (value: Container): string[] => Object.keys(value);

const hasOwn = (value: Container, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

/** Defines `key` on `target` as a plain data property (`__proto__` included, without touching the prototype). */
const define = (target: Container, key: string, value: unknown): void => {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
};

/**
 * An immutable copy of `source` that reuses `previous` (or any of its subtrees) wherever the content is the
 * same, so an unchanged value keeps its identity and a changed one gets new objects only on the path of the
 * change. Leaves are compared with `Object.is` (`NaN` equals `NaN`; `0` and `-0` differ, stricter than the
 * engines, so a snapshot is never staler than the form), `Date`s by `getTime()`; plain objects (own enumerable keys, missing key and
 * `undefined` differ) and arrays are compared item by item. Any other object (`Map`, `Set`, `File`, a class
 * instance) is a leaf kept by reference: the snapshot never copies it.
 *
 * Plain objects and arrays of `source` are never put in the result: they are copied (a form library may
 * mutate them later), with the prototype of the copy as the source's (`null` stays `null`). A `Date` is
 * copied as well. Returns `previous` itself when the content is the same.
 */
export function snapshotOf<T>(source: T, previous?: unknown): T {
  return snap(source, previous, true) as T;
}

/** `true` when `a` and `b` have the same content, with the rules of {@link snapshotOf}. */
export function sameContent(a: unknown, b: unknown): boolean {
  return Object.is(snap(a, b, false), b);
}

/**
 * The core of `snapshotOf`: `previous` when `source` has the same content, otherwise a copy (that reuses the
 * equal subtrees of `previous` when `copy` is set; without `copy`, any value other than `previous` will do and
 * `source` itself is returned, which `sameContent` only compares with `previous`).
 */
function snap(source: unknown, previous: unknown, copy: boolean): unknown {
  // Same identity: `previous` is a snapshot (never mutated) or an object the caller handed over as immutable
  // (`reset(x)`), never an object of the form library, so the content is the same.
  if (Object.is(source, previous)) return previous;
  if (source instanceof Date) {
    if (previous instanceof Date && Object.is(previous.getTime(), source.getTime())) return previous;
    return copy ? new Date(source.getTime()) : source;
  }
  if (Array.isArray(source)) {
    const prev = Array.isArray(previous) ? previous : undefined;
    const items: unknown[] = new Array<unknown>(source.length);
    let same = prev !== undefined && prev.length === source.length;
    for (let i = 0; i < source.length; i += 1) {
      const item = snap(source[i], prev?.[i], copy);
      if (!copy && !Object.is(item, prev?.[i])) return source;
      items[i] = item;
      if (same && !Object.is(item, prev![i])) same = false;
    }
    if (same) return prev;
    return copy ? items : source;
  }
  if (isPlainRecord(source)) {
    const prev = isPlainRecord(previous) && Object.getPrototypeOf(previous) === Object.getPrototypeOf(source) ? previous : undefined;
    const keys = keysOf(source);
    const out: Container = Object.getPrototypeOf(source) === null ? (Object.create(null) as Container) : {};
    let same = prev !== undefined && keysOf(prev).length === keys.length;
    for (const key of keys) {
      const prevChild = prev !== undefined && hasOwn(prev, key) ? prev[key] : undefined;
      if (prev !== undefined && !hasOwn(prev, key)) same = false;
      const child = snap(source[key], prevChild, copy);
      if (!copy && (!same || !Object.is(child, prevChild))) return source;
      define(out, key, child);
      if (same && !Object.is(child, prevChild)) same = false;
    }
    if (same) return prev;
    return copy ? out : source;
  }
  return source;
}

/**
 * The values after a save that returned `returned`, while the form went from `sent` (its values when the save
 * started) to `current` (the user kept typing): every field the user edited since `sent` keeps its `current`
 * value, every other one takes `returned` (what the server stored, its normalization included). Descends into
 * plain objects, and into arrays whose length is the same in the three trees; anywhere else an edited value is
 * kept whole (an array the user resized keeps all of its items). A key the user removed since `sent` stays
 * removed, a key the user added stays; a key the server did not return is dropped unless the user edited it.
 * Content is compared with the rules of {@link snapshotOf}. Returns `returned` itself when the result has its
 * content (nothing edited since `sent`: the form shows what the server stored and is clean). Never mutates its
 * arguments; the result shares their subtrees (all three are immutable snapshots or handed over as such).
 */
export function keepEditsSince<T>(sent: T, current: T, returned: T): T {
  const merged = mergeEdits(sent, current, returned);
  return sameContent(merged, returned) ? returned : (merged as T);
}

function mergeEdits(sent: unknown, current: unknown, returned: unknown): unknown {
  if (sameContent(current, sent)) return returned;
  if (Array.isArray(sent) && Array.isArray(current) && Array.isArray(returned)) {
    if (sent.length !== current.length || current.length !== returned.length) return current;
    return current.map((item: unknown, index) => mergeEdits(sent[index], item, returned[index]));
  }
  if (isPlainRecord(sent) && isPlainRecord(current) && isPlainRecord(returned)) {
    const out: Container = Object.getPrototypeOf(returned) === null ? (Object.create(null) as Container) : {};
    for (const key of keysOf(returned)) {
      if (!hasOwn(current, key)) {
        // Removed by the user since the save started: stays removed. Never there: the server's value.
        if (!hasOwn(sent, key)) define(out, key, returned[key]);
        continue;
      }
      define(out, key, hasOwn(sent, key) ? mergeEdits(sent[key], current[key], returned[key]) : current[key]);
    }
    for (const key of keysOf(current)) {
      if (hasOwn(returned, key)) continue;
      // Not returned by the server: dropped, unless the user edited (or added) it since the save started.
      if (hasOwn(sent, key) && sameContent(current[key], sent[key])) continue;
      define(out, key, current[key]);
    }
    return out;
  }
  return current;
}

/**
 * The value at a dot path (`lines.0.qty`) of a plain object/array tree: `{ found: false }` when a step is
 * missing (a missing key is not `undefined`).
 */
export function valueAtPath(root: unknown, path: string): { found: boolean; value: unknown } {
  let current = root;
  for (const segment of path.split('.')) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return { found: false, value: undefined };
      current = current[index];
    } else if (isPlainRecord(current)) {
      if (!hasOwn(current, segment)) return { found: false, value: undefined };
      current = current[segment];
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: current };
}

/** `true` when the value at `path` is the same in `a` and `b` (both missing counts as the same). */
export function samePathValue(a: unknown, b: unknown, path: string): boolean {
  const left = valueAtPath(a, path);
  const right = valueAtPath(b, path);
  if (left.found !== right.found) return false;
  return sameContent(left.value, right.value);
}

/** An error object of React Hook Form: a node with a string `type` (a field error), not a subtree of errors. */
const FIELD_ERROR_KEYS = new Set(['type', 'message', 'types', 'ref']);

const isFieldError = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';

/**
 * The dot paths of the field errors in a React Hook Form `errors` tree (`supplier.name`, `lines.0.qty`), each
 * with the path of the VALUE it is about: the array itself for the array-level error `lines.root`. The
 * form-level errors (`root`, `root.server`) are left out: they are about no value.
 */
export function fieldErrorPaths(errors: unknown): { errorPath: string; valuePath: string }[] {
  const out: { errorPath: string; valuePath: string }[] = [];
  const visit = (node: unknown, path: string[]): void => {
    if (typeof node !== 'object' || node === null) return;
    const ownError = isFieldError(node);
    for (const key of Object.keys(node)) {
      if (path.length === 0 && key === 'root') continue;
      // The fields of a field error itself (`ref` is a DOM element: never walked).
      if (ownError && FIELD_ERROR_KEYS.has(key)) continue;
      const child = (node as Container)[key];
      const childPath = [...path, key];
      if (isFieldError(child)) {
        const valuePath = key === 'root' ? path : childPath;
        out.push({ errorPath: childPath.join('.'), valuePath: valuePath.join('.') });
      }
      // A field error can also hold the errors of its children (an object field with its own rule).
      visit(child, childPath);
    }
  };
  visit(errors, []);
  return out;
}
