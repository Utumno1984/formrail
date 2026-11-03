import { isDev } from '../internal/is-dev';
import { inferSegmentLabel, itemLabel } from './infer-label';
import type { ChangeEntry, ChangeKind, ChangeSummaryOptions } from './types';

type PlainObject = Record<string, unknown>;

const isDate = (value: unknown): value is Date => Object.prototype.toString.call(value) === '[object Date]';

const isPlainObject = (value: unknown): value is PlainObject => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
};

/** Absent = `undefined` or `null` (a missing key is read as `undefined`). */
const isAbsent = (value: unknown): value is null | undefined => value === undefined || value === null;

/** `===`, except `NaN` equals `NaN` (`0` equals `-0`). */
const sameLeaf = (a: unknown, b: unknown): boolean => a === b || (a !== a && b !== b);

const own = (object: PlainObject, key: string): unknown => (Object.hasOwn(object, key) ? object[key] : undefined);

/** Empty = Absent ∪ '' ∪ [] ∪ plain object whose own enumerable values are all Empty (cycle-safe). */
function isEmptyValue(value: unknown, onStack: Set<object> = new Set()): boolean {
  if (isAbsent(value) || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (!isPlainObject(value)) return false;
  // An object already being inspected higher up contributes no non-empty leaf of its own.
  if (onStack.has(value)) return true;
  onStack.add(value);
  try {
    for (const key of Object.keys(value)) if (!isEmptyValue(value[key], onStack)) return false;
    return true;
  } finally {
    onStack.delete(value);
  }
}

const warned = new Set<string>();

/** Development-only warning, deduplicated per message key (StrictMode double renders included). */
function warnOnce(key: string, message: string): void {
  if (!isDev() || warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

/** Test hook: forget the warnings already emitted. Not part of the public API. */
export function resetChangeSummaryWarnings(): void {
  warned.clear();
}

// Map keys use SameValueZero; ids are compared with Object.is, so -0 gets its own key.
const NEGATIVE_ZERO = Symbol('-0');
const idMapKey = (id: unknown): unknown => (Object.is(id, -0) ? NEGATIVE_ZERO : id);

const NO_ID = Symbol('no id');

function itemId(item: unknown, idKey: string): unknown {
  if (typeof item !== 'object' || item === null) return NO_ID;
  const id = Object.hasOwn(item, idKey) ? (item as PlainObject)[idKey] : undefined;
  return isAbsent(id) ? NO_ID : id;
}

/** Index of every id in `items`, or `null` when an id appears twice. Items without id are skipped. */
function indexById(items: readonly unknown[], idKey: string): Map<unknown, number> | null {
  const map = new Map<unknown, number>();
  for (let i = 0; i < items.length; i += 1) {
    const id = itemId(items[i], idKey);
    if (id === NO_ID) continue;
    const key = idMapKey(id);
    if (map.has(key)) return null;
    map.set(key, i);
  }
  return map;
}

/** Stand-in for an Empty side that has no keys of its own (Absent, `''`, `[]`). */
const NO_KEYS: PlainObject = Object.freeze({});

interface Node {
  /** Concrete segments (indexes included). */
  path: readonly string[];
  /** Segments without array indexes, joined with '.' (key of `arrayIdKeys` / `labels`). */
  schemaPath: string;
  labelPath: readonly string[];
  /** Array item: shares the array's `schemaPath`, but the array's id key is not about it. */
  isItem: boolean;
}

class Differ {
  private readonly onStack = new Map<object, Set<object>>();

  constructor(
    private readonly arrayIdKeys: Readonly<Record<string, string>> | undefined,
    private readonly labels: Readonly<Record<string, string>> | undefined,
    private readonly isEqual: ChangeSummaryOptions<object>['isEqual'],
  ) {}

  private emit(out: ChangeEntry[], node: Node, kind: ChangeKind, before: unknown, after: unknown): void {
    const labelPath = [...node.labelPath];
    out.push({
      path: node.path.join('.'),
      labelPath,
      label: labelPath.join(' > '),
      kind,
      before: kind === 'added' ? undefined : before,
      after: kind === 'removed' ? undefined : after,
    });
  }

  private keyChild(node: Node, key: string): Node {
    const schemaPath = node.schemaPath === '' ? key : `${node.schemaPath}.${key}`;
    const override = this.labels && Object.hasOwn(this.labels, schemaPath) ? this.labels[schemaPath] : undefined;
    return {
      path: [...node.path, key],
      schemaPath,
      labelPath: [...node.labelPath, typeof override === 'string' ? override : inferSegmentLabel(key)],
      isItem: false,
    };
  }

  private indexChild(node: Node, index: number): Node {
    return {
      path: [...node.path, String(index)],
      schemaPath: node.schemaPath,
      labelPath: [...node.labelPath, itemLabel(index)],
      isItem: true,
    };
  }

  /** The id key declared for this node, after checking it is usable (dev warnings otherwise). */
  private idKeyFor(node: Node, before: unknown, after: unknown): string | undefined {
    if (node.path.length === 0 || node.isItem || !this.arrayIdKeys || !Object.hasOwn(this.arrayIdKeys, node.schemaPath)) {
      return undefined;
    }
    const idKey = this.arrayIdKeys[node.schemaPath];
    if (typeof idKey !== 'string') return undefined;
    const usable = (side: unknown) => isAbsent(side) || Array.isArray(side);
    if (!usable(before) || !usable(after)) {
      warnOnce(
        `not-array:${node.schemaPath}`,
        `[react-object-page/pro] useChangeSummary: arrayIdKeys['${node.schemaPath}'] is declared but the value at '${node.path.join('.')}' is not an array; the id key is ignored.`,
      );
      return undefined;
    }
    const dup = [before, after].some((side) => Array.isArray(side) && indexById(side, idKey) === null);
    if (dup) {
      warnOnce(
        `duplicate-id:${node.schemaPath}`,
        `[react-object-page/pro] useChangeSummary: duplicate '${idKey}' values in the array at '${node.path.join('.')}'; it is diffed as a whole block instead of item by item.`,
      );
      return undefined;
    }
    return idKey;
  }

  visit(before: unknown, after: unknown, node: Node, out: ChangeEntry[]): void {
    if (node.path.length > 0 && this.isEqual) {
      const verdict = this.isEqual(before, after, node.path.join('.'));
      if (verdict === true) return;
      if (verdict === false) {
        const kind: ChangeKind =
          isAbsent(before) && !isAbsent(after) ? 'added' : isAbsent(after) && !isAbsent(before) ? 'removed' : 'changed';
        this.emit(out, node, kind, before, after);
        return;
      }
    }
    if (sameLeaf(before, after)) return;

    const idKey = this.idKeyFor(node, before, after);
    const beforeAbsent = isAbsent(before);
    const afterAbsent = isAbsent(after);

    // Rule 1: both Empty.
    if (beforeAbsent && afterAbsent) return;
    if (beforeAbsent || afterAbsent) {
      const present = beforeAbsent ? after : before;
      if (isEmptyValue(present)) {
        this.descendEmpty(before, after, node, out);
        return;
      }
      // Rule 2, id-key exception: Absent counts as [].
      if (idKey !== undefined) {
        this.diffById(beforeAbsent ? [] : (before as unknown[]), afterAbsent ? [] : (after as unknown[]), idKey, node, out);
        return;
      }
      // Rule 2: one atomic entry.
      this.emit(out, node, beforeAbsent ? 'added' : 'removed', before, after);
      return;
    }
    if (isEmptyValue(before) && isEmptyValue(after)) {
      this.descendEmpty(before, after, node, out);
      return;
    }

    // Rule 3: structural comparison.
    if (isDate(before) || isDate(after)) {
      if (!isDate(before) || !isDate(after) || !sameLeaf(before.getTime(), after.getTime())) {
        this.emit(out, node, 'changed', before, after);
      }
      return;
    }
    const beforeArray = Array.isArray(before);
    const afterArray = Array.isArray(after);
    if (beforeArray && afterArray) {
      this.guarded(before, after, () => {
        if (idKey !== undefined) this.diffById(before, after, idKey, node, out);
        else if (!this.sameArray(before, after, node)) this.emit(out, node, 'changed', before, after);
      });
      return;
    }
    if (isPlainObject(before) && isPlainObject(after)) {
      this.guarded(before, after, () => this.diffObject(before, after, node, out));
      return;
    }
    // Type change, or two different non-traversable leaves.
    this.emit(out, node, 'changed', before, after);
  }

  /**
   * Rule 1 with a custom `isEqual`: the default verdict on the whole subtree stays "no entry"
   * (every descendant pair of two Empty sides is Empty too), but `isEqual` is still asked on every
   * descendant pair, exactly as when the subtree has a non-empty sibling. Without `isEqual`
   * nothing is visited (unchanged cost). Only plain objects have children here (Empty array = `[]`).
   */
  private descendEmpty(before: unknown, after: unknown, node: Node, out: ChangeEntry[]): void {
    if (!this.isEqual) return;
    const b = isPlainObject(before) ? before : NO_KEYS;
    const a = isPlainObject(after) ? after : NO_KEYS;
    if (b === NO_KEYS && a === NO_KEYS) return;
    this.guarded(b, a, () => this.diffObject(b, a, node, out));
  }

  /** Runs `body` unless the pair is already being compared higher up (then it counts as equal). */
  private guarded(before: object, after: object, body: () => void): void {
    let partners = this.onStack.get(before);
    if (partners?.has(after)) return;
    if (!partners) {
      partners = new Set();
      this.onStack.set(before, partners);
    }
    partners.add(after);
    try {
      body();
    } finally {
      partners.delete(after);
      if (partners.size === 0) this.onStack.delete(before);
    }
  }

  private diffObject(before: PlainObject, after: PlainObject, node: Node, out: ChangeEntry[]): void {
    const afterKeys = Object.keys(after);
    for (const key of afterKeys) this.visit(own(before, key), after[key], this.keyChild(node, key), out);
    for (const key of Object.keys(before)) {
      if (!Object.hasOwn(after, key)) this.visit(before[key], undefined, this.keyChild(node, key), out);
    }
  }

  /** Block comparison: same length and every positional pair without changes (same rules). */
  private sameArray(before: readonly unknown[], after: readonly unknown[], node: Node): boolean {
    if (before.length !== after.length) return false;
    const probe: ChangeEntry[] = [];
    for (let i = 0; i < after.length; i += 1) {
      this.visit(before[i], after[i], this.indexChild(node, i), probe);
      if (probe.length > 0) return false;
    }
    return true;
  }

  private diffById(before: readonly unknown[], after: readonly unknown[], idKey: string, node: Node, out: ChangeEntry[]): void {
    const beforeIndex = indexById(before, idKey) ?? new Map<unknown, number>();
    const matched = new Set<number>();
    for (let j = 0; j < after.length; j += 1) {
      const item = after[j];
      const id = itemId(item, idKey);
      const i = id === NO_ID ? undefined : beforeIndex.get(idMapKey(id));
      const child = this.indexChild(node, j);
      if (i === undefined) {
        this.emit(out, child, 'added', undefined, item);
      } else {
        matched.add(i);
        this.visit(before[i], item, child, out);
      }
    }
    for (let i = 0; i < before.length; i += 1) {
      if (!matched.has(i)) this.emit(out, this.indexChild(node, i), 'removed', before[i], undefined);
    }
  }
}

const ROOT: Node = { path: [], schemaPath: '', labelPath: [], isItem: false };

/**
 * Field-by-field diff of `values` against the real saved `baseline`: a deterministic list of
 * {@link ChangeEntry}. Pure function; `useChangeSummary` is the memoized hook around it. See
 * {@link ChangeSummaryOptions} for the equality rules, array identity and entry order.
 *
 * `values === baseline` returns an empty list without visiting anything.
 */
export function computeChangeSummary<Values extends object>(options: ChangeSummaryOptions<Values>): ChangeEntry[] {
  const { values, baseline, arrayIdKeys, labels, isEqual } = options;
  const entries: ChangeEntry[] = [];
  if ((values as unknown) === (baseline as unknown)) return entries;
  new Differ(arrayIdKeys, labels, isEqual).visit(baseline, values, ROOT, entries);
  return entries;
}
