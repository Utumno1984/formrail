import type { ChangeEntry, ChangeKind } from '../change-summary/types';
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
  /** The labels of the rebase (`conflict.label` is their join): an item no longer in the values keeps them. */
  labelPath: string[];
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

export const sameSequence = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((key, i) => key === b[i]);

export const NONE: readonly ConflictRecord[] = [];

/** Id map keys of `items` (see `idMapKey`), in order. */
export const keysOf = (items: readonly unknown[], idKey: string): unknown[] => items.map((item) => idMapKey(itemId(item, idKey)));

/** `keys` restricted to the keys in `among`, in the order of `keys`. */
export const restricted = (keys: readonly unknown[], among: ReadonlySet<unknown>): unknown[] => keys.filter((key) => among.has(key));

export const idsOf = (items: readonly unknown[], idKey: string): unknown[] => items.map((item) => itemId(item, idKey));

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

/** The Differ of `applied`, keeping the node of every entry: `itemLabel` names them once the items are merged. */
class EntryDiffer extends Differ {
  readonly nodes: DiffNode[] = [];

  override emit(out: ChangeEntry[], node: DiffNode, kind: ChangeKind, before: unknown, after: unknown): void {
    super.emit(out, node, kind, before, after);
    this.nodes.push(node);
  }
}

export type MergeOptions = Pick<RebaseOptions<object>, 'arrayIdKeys' | 'labels' | 'isEqual'>;

/**
 * The three-way merge. `carried` (the still open conflicts of earlier rebases, #584) is always empty here: the
 * accumulation lives in `rebase-carry.ts`, a subclass that only `useFormRebase` imports, through the optional hooks
 * `carry`, `carryOrder` and `under` (absent here, so `computeRebase` neither carries nor pays for it).
 */
export class Merger {
  readonly applied: ChangeEntry[] = [];
  readonly records: ConflictRecord[] = [];
  protected readonly decide: Differ;
  readonly entries: EntryDiffer;
  private readonly onStack = new Map<object, Set<object>>();

  /** Emits the carried conflicts at or under a node whose result is `mine` (or out of the result) the server kept. */
  protected carry?(mine: unknown, theirs: unknown, node: DiffNode, segments: readonly Segment[], carried: readonly ConflictRecord[]): void;
  /** Emits the carried order conflict of an id-keyed array the server changed without reordering it. */
  protected carryOrder?(node: DiffNode, segments: readonly Segment[], mine: unknown[], theirs: unknown[], idKey: string, carried: readonly ConflictRecord[]): void;
  /** The carried records under the child `step` of a node of `depth` segments. */
  protected under?(carried: readonly ConflictRecord[], depth: number, step: Segment): readonly ConflictRecord[];

  constructor(
    options: MergeOptions,
    readonly carried: readonly ConflictRecord[] = NONE,
  ) {
    this.decide = decisionDiffer(options);
    this.entries = new EntryDiffer({ ...options, source: SOURCE, blockWithoutIds: true });
  }

  private down(carried: readonly ConflictRecord[], depth: number, step: Segment): readonly ConflictRecord[] {
    return carried.length > 0 && this.under ? this.under(carried, depth, step) : NONE;
  }

  /** `carry` on the item `step` of the array of `segments`, when a carried record is there. */
  private carryItem(mine: unknown, theirs: unknown, child: DiffNode, segments: readonly Segment[], step: Segment, carried: readonly ConflictRecord[]): void {
    const sub = this.down(carried, segments.length, step);
    if (sub.length > 0) this.carry?.(mine, theirs, child, [...segments, step], sub);
  }

  /**
   * Merged value of one node (`MISSING` when absent from the result). `carried`: the still open conflicts of the
   * earlier rebases at or under the node (see `rebaseInternal`).
   */
  merge(base: unknown, mine: unknown, theirs: unknown, node: DiffNode, segments: readonly Segment[], carried: readonly ConflictRecord[]): unknown {
    if (!this.decide.differs(base, mine, node)) {
      if (this.decide.differs(base, theirs, node)) this.entries.run(base, theirs, this.applied, node);
      return theirs;
    }
    if (!this.decide.differs(base, theirs, node)) {
      // The server did not change the node: the conflicts of the earlier rebases in it stay where they still differ.
      if (carried.length > 0) this.carry?.(mine, theirs, node, segments, carried);
      return mine;
    }
    // Both sides now hold the same value: nothing is overwritten, the earlier conflicts in it are over.
    if (!this.decide.differs(mine, theirs, node)) return mine;
    // The server changed the node again: this merge decides, the earlier conflicts in it are recomputed.
    return this.mergeChanged(base, mine, theirs, node, segments, carried);
  }

  /** Both sides changed the node, to different values. */
  private mergeChanged(
    base: unknown,
    mine: unknown,
    theirs: unknown,
    node: DiffNode,
    segments: readonly Segment[],
    carried: readonly ConflictRecord[],
  ): unknown {
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
        const merged = this.guarded(mine, theirs, () => this.mergeArray(base, mine, theirs, idKey, node, segments, carried));
        if (merged !== MISSING) return merged;
      } else if (idKey === undefined && isPlainObject(mine) && isPlainObject(theirs) && (baseUsable || isPlainObject(base))) {
        const merged = this.guarded(mine, theirs, () => this.mergeObject(base, mine, theirs, node, segments, carried));
        if (merged !== MISSING) return merged;
      }
    }
    // A conflict on the whole node: it covers the carried conflicts under it.
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

  protected conflict(
    node: DiffNode,
    segments: readonly Segment[],
    base: unknown,
    mine: unknown,
    theirs: unknown,
    order: { idKey: string; base: unknown[]; mine: unknown[]; theirs: unknown[] } | undefined,
  ): void {
    const labelPath = labelPathOf(node);
    this.records.push({
      conflict: {
        path: node.path,
        label: labelPath.join(' > '),
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
      labelPath,
    });
  }

  private mergeObject(
    base: unknown,
    mine: PlainObject,
    theirs: PlainObject,
    node: DiffNode,
    segments: readonly Segment[],
    carried: readonly ConflictRecord[],
  ): PlainObject {
    const baseObject = isPlainObject(base) ? base : undefined;
    const out: PlainObject = Object.getPrototypeOf(mine) === null ? (Object.create(null) as PlainObject) : {};
    const keys = [...Object.keys(mine), ...Object.keys(theirs).filter((key) => !Object.hasOwn(mine, key))];
    for (const key of keys) {
      const step = { key };
      const merged = this.merge(
        baseObject ? own(baseObject, key) : MISSING,
        own(mine, key),
        own(theirs, key),
        this.decide.keyChild(node, key),
        [...segments, step],
        this.down(carried, segments.length, step),
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
    carried: readonly ConflictRecord[],
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
      this.conflict(node, segments, base, mine, theirs, {
        idKey,
        base: idsOf(baseItems, idKey),
        mine: idsOf(mine, idKey),
        theirs: idsOf(theirs, idKey),
      });
    } else if (!theirsReordered && carried.length > 0) {
      this.carryOrder?.(node, segments, mine as unknown[], theirs as unknown[], idKey, carried);
    }
    const fromMine = mineReordered || !theirsReordered;
    const order = fromMine ? arrange(mineKeys, theirsKeys, kept) : arrange(theirsKeys, mineKeys, kept);

    const out: unknown[] = [];
    for (let index = 0; index < order.length; index += 1) {
      const key = order[index];
      const m = mineIndex.get(key);
      const t = theirsIndex.get(key);
      const b = baseIndex.get(key);
      // `itemLabel` gets the item of the result (`child.item`), set once it is merged: labels are named at the end.
      const child = this.decide.indexChild(node, index);
      const baseItem = b === undefined ? MISSING : baseItems[b];
      let item: unknown;
      if (m !== undefined && t !== undefined) {
        const step = { idKey, id: itemId(mine[m], idKey) };
        item = this.merge(baseItem, mine[m], theirs[t], child, [...segments, step], this.down(carried, segments.length, step));
      } else if (m !== undefined) {
        item = mine[m];
        const step = { idKey, id: itemId(item, idKey) };
        if (b !== undefined) this.conflict(child, [...segments, step], baseItem, item, MISSING, undefined);
        // Neither the previous nor this server version has the item: a carried conflict on it (or in it) stays.
        else this.carryItem(item, MISSING, child, segments, step, carried);
      } else {
        item = theirs[t as number];
        this.entries.emit(this.applied, child, 'added', MISSING, item);
      }
      child.item = item;
      out.push(item);
    }
    for (let b = 0; b < baseItems.length; b += 1) {
      const key = baseKeys[b];
      if (removedByTheirs.has(key)) {
        this.entries.emit(this.applied, this.decide.indexChild(node, b, baseItems[b], 'baseline'), 'removed', baseItems[b], MISSING);
      } else if (removedByMineConflicts.has(key)) {
        const t = theirsIndex.get(key) as number;
        const item = theirs[t];
        this.conflict(this.decide.indexChild(node, t, item, 'baseline'), [...segments, { idKey, id: itemId(item, idKey) }], baseItems[b], MISSING, item, undefined);
      } else if (carried.length > 0 && !mineSet.has(key) && theirsIndex.has(key)) {
        // Removed by the user, not changed by the server in this rebase: a carried conflict on it (or in it) stays.
        const t = theirsIndex.get(key) as number;
        const item = theirs[t];
        this.carryItem(MISSING, item, this.decide.indexChild(node, t, item, 'baseline'), segments, { idKey, id: itemId(item, idKey) }, carried);
      }
    }
    return out;
  }
}

/**
 * `computeRebase` plus the conflict records `useFormRebase` keeps. `merger` makes the merge from the merge options
 * (`rebase-carry.ts` passes one that carries the conflicts of the earlier rebases, #584).
 */
export function rebaseInternal<Values extends object>(
  options: RebaseOptions<Values>,
  merger: (options: MergeOptions) => Merger = (o) => new Merger(o),
): RebaseComputation<Values> {
  const { baseline, values, incoming, arrayIdKeys, labels, isEqual, itemLabel } = options;
  const run = merger({ arrayIdKeys, labels, isEqual });
  const merged = run.merge(baseline, values, incoming, ROOT, [], run.carried) as Values;
  if (itemLabel) {
    // Named after the merge, on nodes of this computation only (each one asks `itemLabel` once per slot).
    const labeler = new Differ({ itemLabel, source: SOURCE });
    run.applied.forEach((entry, i) => {
      entry.labelPath = labeler.labelPath(run.entries.nodes[i] as DiffNode);
      entry.label = entry.labelPath.join(' > ');
    });
    for (const record of run.records) {
      record.labelPath = labeler.labelPath(record.node);
      record.conflict.label = record.labelPath.join(' > ');
    }
  }
  return {
    result: { values: merged, baseline: incoming, applied: run.applied, conflicts: run.records.map((r) => r.conflict) },
    records: run.records,
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
