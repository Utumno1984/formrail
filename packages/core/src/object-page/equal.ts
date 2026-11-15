const isDate = (value: unknown): value is Date => Object.prototype.toString.call(value) === '[object Date]';

/** A plain object: `{}` or `Object.create(null)` (never an array, a `Date`, a `Map` or a class instance). */
export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
};

/**
 * Structural deep equality used by `useObjectPageForm` to compute `isDirty`.
 *
 * - primitives: `===`, except `NaN` equals `NaN`. `''`, `null` and `undefined` are all different from each other.
 * - `Date`: compared by `getTime()` (two invalid dates are equal).
 * - arrays and plain objects: compared by content, recursively; a key that is present with value
 *   `undefined` is different from a missing key.
 * - anything else (`Map`, `Set`, class instances, functions, ...): compared by reference. Pass
 *   `isEqual` to `useObjectPageForm` when you need another notion of equality for those.
 *
 * Circular structures are supported (a pair already being compared is assumed equal).
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  return compare(a, b, new WeakMap());
}

function compare(a: unknown, b: unknown, seen: WeakMap<object, WeakSet<object>>): boolean {
  if (a === b) return true;
  // NaN is the only value not equal to itself.
  if (typeof a === 'number' && typeof b === 'number') return a !== a && b !== b;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  if (isDate(a) || isDate(b)) {
    if (!isDate(a) || !isDate(b)) return false;
    return compare(a.getTime(), b.getTime(), seen);
  }

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (!aIsArray && !(isPlainObject(a) && isPlainObject(b))) return false;

  let compared = seen.get(a);
  if (compared?.has(b)) return true;
  if (!compared) {
    compared = new WeakSet();
    seen.set(a, compared);
  }
  compared.add(b);

  if (aIsArray) {
    const left = a as unknown[];
    const right = b as unknown[];
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) if (!compare(left[i], right[i], seen)) return false;
    return true;
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(right, key) || !compare(left[key], right[key], seen)) return false;
  }
  return true;
}
