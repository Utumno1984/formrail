import { inferSegmentLabel, itemLabel } from '../change-summary/infer-label';
import type { ChangeEntry, ChangeKind, ChangeSummaryOptions } from '../change-summary/types';
import { isDev } from './is-dev';

// Structural diff engine shared by `computeChangeSummary` and `computeRebase`: path navigation,
// array identity, labels, "no value" rules and the default leaf comparison documented on
// `ChangeSummaryOptions`.

export type PlainObject = Record<string, unknown>;

export const isDate = (value: unknown): value is Date => Object.prototype.toString.call(value) === '[object Date]';

export const isPlainObject = (value: unknown): value is PlainObject => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
};

/**
 * Internal side of a pair with no own key or no counterpart item, so a missing key never compares
 * equal to a key present with value `undefined`. Never leaves the engines: `isEqual` and the
 * public results get `undefined`, with a `*Missing` flag set.
 */
export const MISSING: unique symbol = Symbol('missing');

export const isAbsent = (value: unknown): value is null | undefined | typeof MISSING =>
  value === undefined || value === null || value === MISSING;

export const kindOf = (before: unknown, after: unknown): ChangeKind =>
  isAbsent(before) === isAbsent(after) ? 'changed' : isAbsent(before) ? 'added' : 'removed';

/** `===`, except `NaN` equals `NaN` (`0` equals `-0`). */
export const sameLeaf = (a: unknown, b: unknown): boolean => a === b || (a !== a && b !== b);

export const own = (object: PlainObject, key: string): unknown => (Object.hasOwn(object, key) ? object[key] : MISSING);

export const exposed = (side: unknown): unknown => (side === MISSING ? undefined : side);

const warned = new Set<string>();

/** Development-only warning, deduplicated per message key (StrictMode double renders included). */
export function warnOnce(key: string, message: string): void {
  if (!isDev() || warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

/** Test hook: forget the warnings already emitted. Not part of the public API. */
export function resetDiffWarnings(): void {
  warned.clear();
}

// Map keys use SameValueZero; ids are compared with Object.is, so -0 gets its own key.
const NEGATIVE_ZERO = Symbol('-0');
export const idMapKey = (id: unknown): unknown => (Object.is(id, -0) ? NEGATIVE_ZERO : id);

export const NO_ID: unique symbol = Symbol('no id');

export function itemId(item: unknown, idKey: string): unknown {
  if (typeof item !== 'object' || item === null) return NO_ID;
  const id = Object.hasOwn(item, idKey) ? (item as PlainObject)[idKey] : undefined;
  return isAbsent(id) ? NO_ID : id;
}

/** Index of every id in `items`, or `null` when an id appears twice. Items without id are skipped. */
export function indexById(items: readonly unknown[], idKey: string): Map<unknown, number> | null {
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

/**
 * A visited position. Linked to its parent instead of copying the segments, so a node costs O(1)
 * whatever its depth; `labelPath` is rebuilt from the chain only when an entry is emitted.
 */
export interface DiffNode {
  parent: DiffNode | undefined;
  /** Number of segments (0 at the root). */
  depth: number;
  /** Concrete segments (indexes included) joined with '.'. */
  path: string;
  /** Segments without array indexes, joined with '.' (key of `arrayIdKeys` / `labels`). */
  schemaPath: string;
  /** Label of the last segment ('' at the root). */
  label: string;
  /** Array item: shares the array's `schemaPath`, but the array's id key is not about it. */
  isItem: boolean;
}

export const ROOT: DiffNode = { parent: undefined, depth: 0, path: '', schemaPath: '', label: '', isItem: false };

const childPath = (node: DiffNode, segment: string): string => (node.depth === 0 ? segment : `${node.path}.${segment}`);

export function labelPathOf(node: DiffNode): string[] {
  const labels: string[] = [];
  for (let n: DiffNode | undefined = node; n && n.depth > 0; n = n.parent) labels.push(n.label);
  return labels.reverse();
}

type Task = () => void;

/** Stand-in pushed into a probe: its only use is `length > 0`, so no entry is built for it. */
const PROBE_HIT = {} as ChangeEntry;

type Probe = ChangeEntry[] & { probe?: true };

export type IsEqualOption = ChangeSummaryOptions<object>['isEqual'];

export interface DifferOptions {
  arrayIdKeys?: Readonly<Record<string, string>> | undefined;
  labels?: Readonly<Record<string, string>> | undefined;
  isEqual?: IsEqualOption;
  /** Name of the public function in the development warnings. */
  source: string;
  /**
   * An id-matched array whose matched items are in a different relative order is a difference
   * (one `changed` entry on the array node). Off for `computeChangeSummary` (a reorder gives no
   * entry).
   */
  reorderIsChange?: boolean;
  /**
   * An array with an item without id (or not an object) under a declared id key is diffed as a
   * block, like duplicate ids. Off for `computeChangeSummary` (such items are `added`/`removed`).
   */
  blockWithoutIds?: boolean;
}

/**
 * The visit is iterative: instead of recursing, a node schedules its children as tasks on an
 * explicit LIFO stack (in reverse, so they run in document order, each one's subtree completing
 * before the next sibling starts). The order of entries and the cycle guard are the same as a
 * recursive depth-first visit, but the depth of a structure is not bounded by the call stack.
 */
export class Differ {
  private readonly onStack = new Map<object, Set<object>>();
  private readonly pending: Task[] = [];
  private readonly arrayIdKeys: Readonly<Record<string, string>> | undefined;
  private readonly labels: Readonly<Record<string, string>> | undefined;
  readonly isEqual: IsEqualOption;
  private readonly source: string;
  private readonly reorderIsChange: boolean;
  private readonly blockWithoutIds: boolean;

  constructor(options: DifferOptions) {
    this.arrayIdKeys = options.arrayIdKeys;
    this.labels = options.labels;
    this.isEqual = options.isEqual;
    this.source = options.source;
    this.reorderIsChange = options.reorderIsChange ?? false;
    this.blockWithoutIds = options.blockWithoutIds ?? false;
  }

  /** Appends to `out` the entries of the pair (`before` = baseline side) visited from `node`. */
  run(before: unknown, after: unknown, out: ChangeEntry[], node: DiffNode = ROOT): void {
    this.visit(before, after, node, out);
    for (let task = this.pending.pop(); task; task = this.pending.pop()) task();
  }

  /** `true` when the pair visited from `node` has at least one entry. */
  differs(before: unknown, after: unknown, node: DiffNode = ROOT): boolean {
    const probe: Probe = Object.assign([], { probe: true as const });
    this.run(before, after, probe, node);
    return probe.length > 0;
  }

  /** Schedules `tasks` to run in order, before anything scheduled earlier. */
  private schedule(tasks: readonly Task[]): void {
    for (let i = tasks.length - 1; i >= 0; i -= 1) this.pending.push(tasks[i] as Task);
  }

  emit(out: ChangeEntry[], node: DiffNode, kind: ChangeKind, before: unknown, after: unknown): void {
    // A probe only answers "is there any difference?"; a real entry costs O(depth) (label path),
    // which makes nested blocks O(depth^2) overall.
    if ((out as Probe).probe) {
      out.push(PROBE_HIT);
      return;
    }
    const labelPath = labelPathOf(node);
    out.push({
      path: node.path,
      labelPath,
      label: labelPath.join(' > '),
      kind,
      before: kind === 'added' ? undefined : exposed(before),
      after: kind === 'removed' ? undefined : exposed(after),
      beforeMissing: before === MISSING,
      afterMissing: after === MISSING,
    });
  }

  keyChild(node: DiffNode, key: string): DiffNode {
    const schemaPath = node.schemaPath === '' ? key : `${node.schemaPath}.${key}`;
    const override = this.labels && Object.hasOwn(this.labels, schemaPath) ? this.labels[schemaPath] : undefined;
    return {
      parent: node,
      depth: node.depth + 1,
      path: childPath(node, key),
      schemaPath,
      label: typeof override === 'string' ? override : inferSegmentLabel(key),
      isItem: false,
    };
  }

  indexChild(node: DiffNode, index: number): DiffNode {
    return {
      parent: node,
      depth: node.depth + 1,
      path: childPath(node, String(index)),
      schemaPath: node.schemaPath,
      label: itemLabel(index),
      isItem: true,
    };
  }

  /**
   * The id key declared for this node, after checking it is usable on every side passed (dev
   * warnings otherwise); `undefined` means "diff as a block".
   */
  idKeyFor(node: DiffNode, ...sides: unknown[]): string | undefined {
    if (node.depth === 0 || node.isItem || !this.arrayIdKeys || !Object.hasOwn(this.arrayIdKeys, node.schemaPath)) {
      return undefined;
    }
    const idKey = this.arrayIdKeys[node.schemaPath];
    if (typeof idKey !== 'string') return undefined;
    if (!sides.every((side) => isAbsent(side) || Array.isArray(side))) {
      warnOnce(
        `not-array:${this.source}:${node.schemaPath}`,
        `[react-object-page/pro] ${this.source}: arrayIdKeys['${node.schemaPath}'] is declared but the value at '${node.path}' is not an array; the id key is ignored.`,
      );
      return undefined;
    }
    if (sides.some((side) => Array.isArray(side) && indexById(side, idKey) === null)) {
      warnOnce(
        `duplicate-id:${this.source}:${node.schemaPath}`,
        `[react-object-page/pro] ${this.source}: duplicate '${idKey}' values in the array at '${node.path}'; it is diffed as a whole block instead of item by item.`,
      );
      return undefined;
    }
    if (this.blockWithoutIds && sides.some((side) => Array.isArray(side) && side.some((item) => itemId(item, idKey) === NO_ID))) {
      warnOnce(
        `missing-id:${this.source}:${node.schemaPath}`,
        `[react-object-page/pro] ${this.source}: an item without '${idKey}' in the array at '${node.path}'; it is merged as a whole block instead of item by item.`,
      );
      return undefined;
    }
    return idKey;
  }

  private visit(before: unknown, after: unknown, node: DiffNode, out: ChangeEntry[]): void {
    if (node.depth > 0 && this.isEqual) {
      const verdict = this.isEqual(exposed(before), exposed(after), node.path);
      if (verdict === true) return;
      if (verdict === false) {
        this.emit(out, node, kindOf(before, after), before, after);
        return;
      }
    }
    if (sameLeaf(before, after)) return;

    const idKey = this.idKeyFor(node, before, after);
    const beforeAbsent = isAbsent(before);
    const afterAbsent = isAbsent(after);

    if (beforeAbsent || afterAbsent) {
      // Id-key exception of rule 2. `[]` has no item to report, so against Absent it stays atomic:
      // it differs from Absent like any other value.
      const items = beforeAbsent ? after : before;
      if (idKey !== undefined && Array.isArray(items) && items.length > 0) {
        this.diffById(beforeAbsent ? [] : items, afterAbsent ? [] : items, idKey, node, out);
        return;
      }
      // Rules 1 and 2: one atomic entry.
      this.emit(out, node, kindOf(before, after), before, after);
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
        else this.diffBlock(before, after, node, out);
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
   * Runs `body` unless the pair is already being compared higher up (then it counts as equal).
   * The pair stays "on the stack" until every task `body` schedules has run.
   */
  private guarded(before: object, after: object, body: () => void): void {
    let partners = this.onStack.get(before);
    if (partners?.has(after)) return;
    if (!partners) {
      partners = new Set();
      this.onStack.set(before, partners);
    }
    const set = partners;
    set.add(after);
    // Pushed first, so it runs after everything `body` schedules (LIFO).
    this.pending.push(() => {
      set.delete(after);
      if (set.size === 0) this.onStack.delete(before);
    });
    body();
  }

  private diffObject(before: PlainObject, after: PlainObject, node: DiffNode, out: ChangeEntry[]): void {
    const tasks: Task[] = [];
    for (const key of Object.keys(after)) {
      tasks.push(() => this.visit(own(before, key), after[key], this.keyChild(node, key), out));
    }
    for (const key of Object.keys(before)) {
      if (!Object.hasOwn(after, key)) tasks.push(() => this.visit(before[key], MISSING, this.keyChild(node, key), out));
    }
    this.schedule(tasks);
  }

  /**
   * Block comparison: one `changed` entry unless same length and every positional pair is
   * without changes (same rules). Stops at the first positional pair that differs.
   */
  private diffBlock(before: readonly unknown[], after: readonly unknown[], node: DiffNode, out: ChangeEntry[]): void {
    if (before.length !== after.length) {
      this.emit(out, node, 'changed', before, after);
      return;
    }
    const probe: Probe = Object.assign([], { probe: true as const });
    const tasks: Task[] = [];
    for (let i = 0; i < after.length; i += 1) {
      tasks.push(() => {
        if (probe.length === 0) this.visit(before[i], after[i], this.indexChild(node, i), probe);
      });
    }
    tasks.push(() => {
      if (probe.length > 0) this.emit(out, node, 'changed', before, after);
    });
    this.schedule(tasks);
  }

  private diffById(before: readonly unknown[], after: readonly unknown[], idKey: string, node: DiffNode, out: ChangeEntry[]): void {
    const beforeIndex = indexById(before, idKey) ?? new Map<unknown, number>();
    const matched = new Set<number>();
    const tasks: Task[] = [];
    let lastMatched = -1;
    let reordered = false;
    for (let j = 0; j < after.length; j += 1) {
      const item = after[j];
      const id = itemId(item, idKey);
      const i = id === NO_ID ? undefined : beforeIndex.get(idMapKey(id));
      if (i === undefined) {
        tasks.push(() => this.emit(out, this.indexChild(node, j), 'added', MISSING, item));
      } else {
        matched.add(i);
        if (i < lastMatched) reordered = true;
        lastMatched = i;
        tasks.push(() => this.visit(before[i], item, this.indexChild(node, j), out));
      }
    }
    for (let i = 0; i < before.length; i += 1) {
      if (!matched.has(i)) tasks.push(() => this.emit(out, this.indexChild(node, i), 'removed', before[i], MISSING));
    }
    if (this.reorderIsChange && reordered) tasks.unshift(() => this.emit(out, node, 'changed', before, after));
    this.schedule(tasks);
  }
}
