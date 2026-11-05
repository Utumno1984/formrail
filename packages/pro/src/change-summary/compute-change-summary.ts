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

/**
 * Internal side of a pair with no own key or no counterpart item, so a missing key never compares
 * equal to a key present with value `undefined`. Never leaves this module: `isEqual` and
 * `ChangeEntry` get `undefined`, the entry with `beforeMissing` / `afterMissing` set.
 */
const MISSING = Symbol('missing');

const isAbsent = (value: unknown): value is null | undefined | typeof MISSING =>
  value === undefined || value === null || value === MISSING;

const kindOf = (before: unknown, after: unknown): ChangeKind =>
  isAbsent(before) === isAbsent(after) ? 'changed' : isAbsent(before) ? 'added' : 'removed';

/** `===`, except `NaN` equals `NaN` (`0` equals `-0`). */
const sameLeaf = (a: unknown, b: unknown): boolean => a === b || (a !== a && b !== b);

const own = (object: PlainObject, key: string): unknown => (Object.hasOwn(object, key) ? object[key] : MISSING);

const exposed = (side: unknown): unknown => (side === MISSING ? undefined : side);

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

/**
 * A visited position. Linked to its parent instead of copying the segments, so a node costs O(1)
 * whatever its depth; `labelPath` is rebuilt from the chain only when an entry is emitted.
 */
interface Node {
  parent: Node | undefined;
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

const ROOT: Node = { parent: undefined, depth: 0, path: '', schemaPath: '', label: '', isItem: false };

const childPath = (node: Node, segment: string): string => (node.depth === 0 ? segment : `${node.path}.${segment}`);

function labelPathOf(node: Node): string[] {
  const labels: string[] = [];
  for (let n: Node | undefined = node; n && n.depth > 0; n = n.parent) labels.push(n.label);
  return labels.reverse();
}

type Task = () => void;

/** Stand-in pushed into a probe: its only use is `length > 0`, so no entry is built for it. */
const PROBE_HIT = {} as ChangeEntry;

type Probe = ChangeEntry[] & { probe?: true };

/**
 * The visit is iterative: instead of recursing, a node schedules its children as tasks on an
 * explicit LIFO stack (in reverse, so they run in document order, each one's subtree completing
 * before the next sibling starts). The order of entries and the cycle guard are the same as a
 * recursive depth-first visit, but the depth of a structure is not bounded by the call stack.
 */
class Differ {
  private readonly onStack = new Map<object, Set<object>>();
  private readonly pending: Task[] = [];

  constructor(
    private readonly arrayIdKeys: Readonly<Record<string, string>> | undefined,
    private readonly labels: Readonly<Record<string, string>> | undefined,
    private readonly isEqual: ChangeSummaryOptions<object>['isEqual'],
  ) {}

  run(before: unknown, after: unknown, out: ChangeEntry[]): void {
    this.visit(before, after, ROOT, out);
    for (let task = this.pending.pop(); task; task = this.pending.pop()) task();
  }

  /** Schedules `tasks` to run in order, before anything scheduled earlier. */
  private schedule(tasks: readonly Task[]): void {
    for (let i = tasks.length - 1; i >= 0; i -= 1) this.pending.push(tasks[i] as Task);
  }

  private emit(out: ChangeEntry[], node: Node, kind: ChangeKind, before: unknown, after: unknown): void {
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

  private keyChild(node: Node, key: string): Node {
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

  private indexChild(node: Node, index: number): Node {
    return {
      parent: node,
      depth: node.depth + 1,
      path: childPath(node, String(index)),
      schemaPath: node.schemaPath,
      label: itemLabel(index),
      isItem: true,
    };
  }

  /** The id key declared for this node, after checking it is usable (dev warnings otherwise). */
  private idKeyFor(node: Node, before: unknown, after: unknown): string | undefined {
    if (node.depth === 0 || node.isItem || !this.arrayIdKeys || !Object.hasOwn(this.arrayIdKeys, node.schemaPath)) {
      return undefined;
    }
    const idKey = this.arrayIdKeys[node.schemaPath];
    if (typeof idKey !== 'string') return undefined;
    const usable = (side: unknown) => isAbsent(side) || Array.isArray(side);
    if (!usable(before) || !usable(after)) {
      warnOnce(
        `not-array:${node.schemaPath}`,
        `[react-object-page/pro] useChangeSummary: arrayIdKeys['${node.schemaPath}'] is declared but the value at '${node.path}' is not an array; the id key is ignored.`,
      );
      return undefined;
    }
    const dup = [before, after].some((side) => Array.isArray(side) && indexById(side, idKey) === null);
    if (dup) {
      warnOnce(
        `duplicate-id:${node.schemaPath}`,
        `[react-object-page/pro] useChangeSummary: duplicate '${idKey}' values in the array at '${node.path}'; it is diffed as a whole block instead of item by item.`,
      );
      return undefined;
    }
    return idKey;
  }

  private visit(before: unknown, after: unknown, node: Node, out: ChangeEntry[]): void {
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

  private diffObject(before: PlainObject, after: PlainObject, node: Node, out: ChangeEntry[]): void {
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
  private diffBlock(before: readonly unknown[], after: readonly unknown[], node: Node, out: ChangeEntry[]): void {
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

  private diffById(before: readonly unknown[], after: readonly unknown[], idKey: string, node: Node, out: ChangeEntry[]): void {
    const beforeIndex = indexById(before, idKey) ?? new Map<unknown, number>();
    const matched = new Set<number>();
    const tasks: Task[] = [];
    for (let j = 0; j < after.length; j += 1) {
      const item = after[j];
      const id = itemId(item, idKey);
      const i = id === NO_ID ? undefined : beforeIndex.get(idMapKey(id));
      if (i === undefined) {
        tasks.push(() => this.emit(out, this.indexChild(node, j), 'added', MISSING, item));
      } else {
        matched.add(i);
        tasks.push(() => this.visit(before[i], item, this.indexChild(node, j), out));
      }
    }
    for (let i = 0; i < before.length; i += 1) {
      if (!matched.has(i)) tasks.push(() => this.emit(out, this.indexChild(node, i), 'removed', before[i], MISSING));
    }
    this.schedule(tasks);
  }
}

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
  new Differ(arrayIdKeys, labels, isEqual).run(baseline, values, entries);
  return entries;
}
