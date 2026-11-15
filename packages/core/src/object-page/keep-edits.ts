// The values after a save that settled while the user kept typing (ticket #545): the rule of `keepEditsSince`
// of the React Hook Form adapter (`@formrail/pro`, ticket #507), reimplemented here because the core never
// depends on the Pro package and the adapter never imports from the core (boundary of #489). The shared
// contract suite (`packages/pro/test/binding-contract.ts`) runs on both through their public APIs and keeps
// them aligned. Internal: not exported by the public index.
//
// One known and accepted difference: content is compared with `deepEqual` (equal.ts), where `0` equals `-0`;
// the adapter compares leaves with `Object.is`, where they differ. No contract check depends on it.
import { deepEqual, isPlainObject } from './equal';

type Container = Record<string, unknown>;

const hasOwn = (value: Container, key: string): boolean => Object.hasOwn(value, key);

/** Defines `key` on `target` as a plain data property (`__proto__` included, without touching the prototype). */
const define = (target: Container, key: string, value: unknown): void => {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
};

/**
 * The values after a save that returned `returned`, while the form went from `sent` (its values when the save
 * started) to `current`: every field edited since `sent` keeps its `current` value, every other one takes
 * `returned` (what the server stored, its normalization included).
 *
 * - "Edited since `sent`" is decided by content with `deepEqual`, never with the `isEqual` of the form: a field
 *   typed and brought back to the sent value counts as untouched.
 * - Descends into plain objects (also with a `null` prototype) present as plain objects in all three.
 * - An array edited since `sent` is kept whole (the user's), also with the same length in all three: rows are
 *   never paired by position, so a reorder by the server never moves an edit to another row. An array not
 *   edited takes the server's, its reorder included.
 * - Keys: a key the user removed since `sent` stays removed, a key the user added stays; a key the server did
 *   not return is dropped unless the user edited (or added) it.
 * - Anything else (a `Map`, a `Set`, a class instance, a `Date`, a primitive), and a subtree that is not a plain
 *   object in one of the three: the user's value when edited, the server's otherwise.
 *
 * Returns `returned` itself when the result has its content (the form shows what the server stored and is
 * clean), otherwise `current` itself when the result has its content, otherwise a new object. Never mutates its
 * arguments and never copies deeply: every subtree of the result is a subtree of `returned` or `current`.
 */
export function keepEditsSince<T>(sent: T, current: T, returned: T): T {
  const merged = mergeEdits(sent, current, returned);
  if (deepEqual(merged, returned)) return returned;
  if (deepEqual(merged, current)) return current;
  return merged as T;
}

function mergeEdits(sent: unknown, current: unknown, returned: unknown): unknown {
  if (deepEqual(current, sent)) return returned;
  // Only plain objects (`{}`, `Object.create(null)`) are descended into, never an array.
  if (isPlainObject(sent) && isPlainObject(current) && isPlainObject(returned)) {
    const out: Container = Object.getPrototypeOf(returned) === null ? (Object.create(null) as Container) : {};
    for (const key of Object.keys(returned)) {
      if (!hasOwn(current, key)) {
        // Removed by the user since the save started: stays removed. Never there: the server's value.
        if (!hasOwn(sent, key)) define(out, key, returned[key]);
        continue;
      }
      define(out, key, hasOwn(sent, key) ? mergeEdits(sent[key], current[key], returned[key]) : current[key]);
    }
    for (const key of Object.keys(current)) {
      if (hasOwn(returned, key)) continue;
      // Not returned by the server: dropped, unless the user edited (or added) it since the save started.
      if (hasOwn(sent, key) && deepEqual(current[key], sent[key])) continue;
      define(out, key, current[key]);
    }
    return out;
  }
  // An array or any other value edited since the save started: the user's, whole.
  return current;
}
