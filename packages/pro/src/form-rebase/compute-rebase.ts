import type { ChangeEntry } from '../change-summary/types';
import {
  Differ,
  MISSING,
  ROOT,
  exposed,
  idMapKey,
  indexById,
  isAbsent,
  isPlainObject,
  itemId,
  labelPathOf,
  own,
  type DiffNode,
  type PlainObject,
} from '../internal/structural-diff';
import type { RebaseConflict, RebaseOptions, RebaseResult } from './types';

/** One step from a parent to a child: an object key, or an item of an id-keyed array by id. */
export type Segment = { readonly key: string } | { readonly idKey: string; readonly id: unknown };

/** A conflict with what `useFormRebase` needs to find, compare and resolve it later. */
export interface ConflictRecord {
  conflict: RebaseConflict;
  node: DiffNode;
  segments: readonly Segment[];
  /** Id key of the array for an order-only conflict, `undefined` otherwise. */
  orderIdKey: string | undefined;
  /** Incoming side (`MISSING` when absent); the incoming array for an order conflict. */
  theirs: unknown;
}

export interface RebaseComputation<Values> {
  result: RebaseResult<Values>;
  records: ConflictRecord[];
}

export const SOURCE = 'computeRebase';

/** The Differ used to decide "changed": a reorder of an id-keyed array is a change. */
export function decisionDiffer(options: Pick<RebaseOptions<object>, 'arrayIdKeys' | 'labels' | 'isEqual'>): Differ {
  return new Differ({ ...options, source: SOURCE, reorderIsChange: true, blockWithoutIds: true });
}

const sameSequence = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((key, i) => key === b[i]);

/** Id map keys of `items` (see `idMapKey`), in order. */
export const keysOf = (items: readonly unknown[], idKey: string): unknown[] => items.map((item) => idMapKey(itemId(item, idKey)));

/** `keys` restricted to the keys in `among`, in the order of `keys`. */
const restricted = (keys: readonly unknown[], among: ReadonlySet<unknown>): unknown[] => keys.filter((key) => among.has(key));

/**
 * Order of the merged items: `primary` restricted to `kept`, then every other kept key of
 * `secondary`, in the order of `secondary`, right after its immediate predecessor in `secondary`
 * when that predecessor is already placed, otherwise at the end.
 */
export function arrange(primary: readonly unknown[], secondary: readonly unknown[], kept: ReadonlySet<unknown>): unknown[] {
  const order = primary.filter((key) => kept.has(key));
  const placed = new Set(order);
  for (let i = 0; i < secondary.length; i += 1) {
    const key = secondary[i];
    if (!kept.has(key) || placed.has(key)) continue;
    const at = i > 0 ? order.indexOf(secondary[i - 1]) : -1;
    if (at >= 0) order.splice(at + 1, 0, key);
    else order.push(key);
    placed.add(key);
  }
  return order;
}

function put(target: PlainObject, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

class Merger {
  readonly applied: ChangeEntry[] = [];
  readonly records: ConflictRecord[] = [];
  private readonly decide: Differ;
  private readonly entries: Differ;
  private readonly onStack = new Map<object, Set<object>>();

  constructor(options: Pick<RebaseOptions<object>, 'arrayIdKeys' | 'labels' | 'isEqual'>) {
    this.decide = decisionDiffer(options);
    this.entries = new Differ({ ...options, source: SOURCE, blockWithoutIds: true });
  }

  /** Merged value of one node (`MISSING` when absent from the result). */
  merge(base: unknown, mine: unknown, theirs: unknown, node: DiffNode, segments: readonly Segment[]): unknown {
    if (!this.decide.differs(base, mine, node)) {
      if (this.decide.differs(base, theirs, node)) this.entries.run(base, theirs, this.applied, node);
      return theirs;
    }
    if (!this.decide.differs(base, theirs, node) || !this.decide.differs(mine, theirs, node)) return mine;
    return this.mergeChanged(base, mine, theirs, node, segments);
  }

  /** Both sides changed the node, to different values. */
  private mergeChanged(base: unknown, mine: unknown, theirs: unknown, node: DiffNode, segments: readonly Segment[]): unknown {
    const { isEqual } = this.decide;
    const decidedByIsEqual =
      node.depth > 0 &&
      isEqual !== undefined &&
      [
        [base, mine],
        [base, theirs],
        [mine, theirs],
      ].some(([a, b]) => isEqual(exposed(a), exposed(b), node.path) !== undefined);
    if (!decidedByIsEqual) {
      const idKey = this.decide.idKeyFor(node, base, mine, theirs);
      const baseUsable = isAbsent(base);
      if (idKey !== undefined && Array.isArray(mine) && Array.isArray(theirs) && (baseUsable || Array.isArray(base))) {
        const merged = this.guarded(mine, theirs, () => this.mergeArray(base, mine, theirs, idKey, node, segments));
        if (merged !== MISSING) return merged;
      } else if (idKey === undefined && isPlainObject(mine) && isPlainObject(theirs) && (baseUsable || isPlainObject(base))) {
        const merged = this.guarded(mine, theirs, () => this.mergeObject(base, mine, theirs, node, segments));
        if (merged !== MISSING) return merged;
      }
    }
    this.conflict(node, segments, base, mine, theirs, undefined);
    return mine;
  }

  /** Runs `body` unless the pair is already being merged higher up (cycle): then `MISSING`. */
  private guarded(mine: object, theirs: object, body: () => unknown): unknown {
    let partners = this.onStack.get(mine);
    if (partners?.has(theirs)) return MISSING;
    if (!partners) {
      partners = new Set();
      this.onStack.set(mine, partners);
    }
    partners.add(theirs);
    try {
      return body();
    } finally {
      partners.delete(theirs);
      if (partners.size === 0) this.onStack.delete(mine);
    }
  }

  private conflict(
    node: DiffNode,
    segments: readonly Segment[],
    base: unknown,
    mine: unknown,
    theirs: unknown,
    order: { idKey: string; base: unknown[]; mine: unknown[]; theirs: unknown[] } | undefined,
  ): void {
    this.records.push({
      conflict: {
        path: node.path,
        label: labelPathOf(node).join(' > '),
        base: order ? order.base : exposed(base),
        mine: order ? order.mine : exposed(mine),
        theirs: order ? order.theirs : exposed(theirs),
        baseMissing: !order && base === MISSING,
        mineMissing: !order && mine === MISSING,
        theirsMissing: !order && theirs === MISSING,
      },
      node,
      segments,
      orderIdKey: order?.idKey,
      theirs,
    });
  }

  private mergeObject(base: unknown, mine: PlainObject, theirs: PlainObject, node: DiffNode, segments: readonly Segment[]): PlainObject {
    const baseObject = isPlainObject(base) ? base : undefined;
    const out: PlainObject = Object.getPrototypeOf(mine) === null ? (Object.create(null) as PlainObject) : {};
    const keys = [...Object.keys(mine), ...Object.keys(theirs).filter((key) => !Object.hasOwn(mine, key))];
    for (const key of keys) {
      const merged = this.merge(
        baseObject ? own(baseObject, key) : MISSING,
        own(mine, key),
        own(theirs, key),
        this.decide.keyChild(node, key),
        [...segments, { key }],
      );
      if (merged !== MISSING) put(out, key, merged);
    }
    return out;
  }

  private mergeArray(
    base: unknown,
    mine: readonly unknown[],
    theirs: readonly unknown[],
    idKey: string,
    node: DiffNode,
    segments: readonly Segment[],
  ): unknown[] {
    const baseItems: readonly unknown[] = Array.isArray(base) ? base : [];
    // `idKeyFor` checked every side: no duplicate, every item has an id.
    const baseIndex = indexById(baseItems, idKey) as Map<unknown, number>;
    const mineIndex = indexById(mine, idKey) as Map<unknown, number>;
    const theirsIndex = indexById(theirs, idKey) as Map<unknown, number>;
    const baseKeys = keysOf(baseItems, idKey);
    const mineKeys = keysOf(mine, idKey);
    const theirsKeys = keysOf(theirs, idKey);

    const kept = new Set<unknown>();
    const removedByTheirs = new Set<unknown>();
    const removedByMineConflicts = new Set<unknown>();
    for (let j = 0; j < mine.length; j += 1) {
      const key = mineKeys[j];
      const b = baseIndex.get(key);
      if (b !== undefined && !theirsIndex.has(key) && !this.decide.differs(baseItems[b], mine[j], this.decide.indexChild(node, j))) {
        removedByTheirs.add(key);
      } else kept.add(key);
    }
    for (let t = 0; t < theirs.length; t += 1) {
      const key = theirsKeys[t];
      if (mineIndex.has(key)) continue;
      const b = baseIndex.get(key);
      if (b === undefined) kept.add(key);
      else if (this.decide.differs(baseItems[b], theirs[t], this.decide.indexChild(node, t))) removedByMineConflicts.add(key);
    }

    const baseSet = new Set(baseKeys);
    const mineSet = new Set(mineKeys);
    const theirsSet = new Set(theirsKeys);
    const mineReordered = !sameSequence(restricted(mineKeys, baseSet), restricted(baseKeys, mineSet));
    const theirsReordered = !sameSequence(restricted(theirsKeys, baseSet), restricted(baseKeys, theirsSet));
    const shared = new Set(baseKeys.filter((key) => mineSet.has(key) && theirsSet.has(key)));
    if (mineReordered && theirsReordered && !sameSequence(restricted(mineKeys, shared), restricted(theirsKeys, shared))) {
      const ids = (items: readonly unknown[]) => items.map((item) => itemId(item, idKey));
      this.conflict(node, segments, base, mine, theirs, {
        idKey,
        base: ids(baseItems),
        mine: ids(mine),
        theirs: ids(theirs),
      });
    }
    const fromMine = mineReordered || !theirsReordered;
    const order = fromMine ? arrange(mineKeys, theirsKeys, kept) : arrange(theirsKeys, mineKeys, kept);

    const out: unknown[] = [];
    for (let index = 0; index < order.length; index += 1) {
      const key = order[index];
      const m = mineIndex.get(key);
      const t = theirsIndex.get(key);
      const b = baseIndex.get(key);
      const child = this.decide.indexChild(node, index);
      const baseItem = b === undefined ? MISSING : baseItems[b];
      if (m !== undefined && t !== undefined) {
        const item = mine[m];
        out.push(this.merge(baseItem, item, theirs[t], child, [...segments, { idKey, id: itemId(item, idKey) }]));
      } else if (m !== undefined) {
        const item = mine[m];
        if (b !== undefined) this.conflict(child, [...segments, { idKey, id: itemId(item, idKey) }], baseItem, item, MISSING, undefined);
        out.push(item);
      } else {
        const item = theirs[t as number];
        this.entries.emit(this.applied, child, 'added', MISSING, item);
        out.push(item);
      }
    }
    for (let b = 0; b < baseItems.length; b += 1) {
      const key = baseKeys[b];
      if (removedByTheirs.has(key)) {
        this.entries.emit(this.applied, this.decide.indexChild(node, b), 'removed', baseItems[b], MISSING);
      } else if (removedByMineConflicts.has(key)) {
        const t = theirsIndex.get(key) as number;
        const item = theirs[t];
        this.conflict(this.decide.indexChild(node, t), [...segments, { idKey, id: itemId(item, idKey) }], baseItems[b], MISSING, item, undefined);
      }
    }
    return out;
  }
}

/** `computeRebase` plus the conflict records `useFormRebase` keeps. */
export function rebaseInternal<Values extends object>(options: RebaseOptions<Values>): RebaseComputation<Values> {
  const { baseline, values, incoming, arrayIdKeys, labels, isEqual } = options;
  const merger = new Merger({ arrayIdKeys, labels, isEqual });
  const merged = merger.merge(baseline, values, incoming, ROOT, []) as Values;
  return {
    result: { values: merged, baseline: incoming, applied: merger.applied, conflicts: merger.records.map((r) => r.conflict) },
    records: merger.records,
  };
}

/**
 * Three-way merge of a new server version (`incoming`) into the user's draft (`values`), both
 * descending from `baseline`: paths the user did not touch take the incoming value (listed in
 * `applied`), touched paths keep the user's value, and paths changed by both sides to different
 * values keep the user's value and are listed in `conflicts`. Rules, array identity and order in
 * {@link RebaseOptions}.
 *
 * Pure and deterministic: the inputs are never mutated, and subtrees taken unchanged from one side
 * keep their reference. `values` equal to `baseline` returns `incoming` itself; `incoming` equal to
 * `baseline` returns `values` itself, with `applied` and `conflicts` empty.
 */
export function computeRebase<Values extends object>(options: RebaseOptions<Values>): RebaseResult<Values> {
  return rebaseInternal(options).result;
}
