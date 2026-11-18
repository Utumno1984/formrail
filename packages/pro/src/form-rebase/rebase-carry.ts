// The accumulation of the conflicts across rebases (#584), for `useFormRebase` only: a separate module so that
// `computeRebase` (one merge, no memory of earlier ones) does not carry its weight.
import { MISSING, idMapKey, isPlainObject, itemId, own, type DiffNode } from '../internal/structural-diff';
import {
  Merger,
  NONE,
  idsOf,
  keysOf,
  rebaseInternal,
  restricted,
  sameSequence,
  type ConflictRecord,
  type RebaseComputation,
  type Segment,
} from './compute-rebase';
import type { RebaseOptions } from './types';

type IdSegment = Extract<Segment, { idKey: string }>;

const idOf = (item: unknown, idKey: string): unknown => idMapKey(itemId(item, idKey));

/** Same relative order of the items `a` and `b` share. */
export function sameOrder(a: readonly unknown[], b: readonly unknown[], idKey: string): boolean {
  const aKeys = keysOf(a, idKey);
  const bKeys = keysOf(b, idKey);
  return sameSequence(restricted(aKeys, new Set(bKeys)), restricted(bKeys, new Set(aKeys)));
}

/**
 * The merge with `carried`, the conflicts of the earlier rebases still open on `values`: they are emitted again, with
 * the paths and labels of this rebase, at the places this rebase does not decide (the server did not change them since
 * `baseline`) where the user's value still differs from `incoming`. Where the server changed the value again the merge
 * decides alone (one conflict whose `base` is the value of `baseline`, or none when both sides now agree). No path is
 * emitted twice, and a conflict on a node covers the ones under it.
 */
class CarryingMerger extends Merger {
  protected override under(carried: readonly ConflictRecord[], depth: number, step: Segment): readonly ConflictRecord[] {
    const found = carried.filter(({ segments }) => {
      const s = segments[depth];
      if (s === undefined) return false;
      return 'idKey' in step ? 'idKey' in s && s.idKey === step.idKey && idMapKey(s.id) === idMapKey(step.id) : 'key' in s && s.key === step.key;
    });
    return found.length > 0 ? found : NONE;
  }

  protected override carryOrder(
    node: DiffNode,
    segments: readonly Segment[],
    mine: unknown[],
    theirs: unknown[],
    idKey: string,
    carried: readonly ConflictRecord[],
  ): void {
    const record = carried.find((r) => r.segments.length === segments.length && r.orderIdKey === idKey);
    if (record && !sameOrder(mine, theirs, idKey)) {
      this.conflict(node, segments, MISSING, mine, theirs, {
        idKey,
        base: record.conflict.base as unknown[],
        mine: idsOf(mine, idKey),
        theirs: idsOf(theirs, idKey),
      });
    }
  }

  /**
   * Emits the carried conflicts at or under a node whose result is `mine` (`MISSING` for an item out of the result)
   * and that the server did not change in this rebase, where the user's value still differs from the server's: with
   * their `base`, and the sides, path and labels of this rebase. In the depth-first order of the result: keys of
   * `mine`, then the keys only in `theirs`; items of `mine` (index in the result), then the items only in `theirs`
   * (index there, named on the `'baseline'` side).
   */
  protected override carry(mine: unknown, theirs: unknown, node: DiffNode, segments: readonly Segment[], carried: readonly ConflictRecord[]): void {
    const depth = segments.length;
    const here = carried.filter((r) => r.segments.length === depth);
    const onValue = here.find((r) => r.orderIdKey === undefined);
    if (onValue) {
      const { base, baseMissing } = onValue.conflict;
      if (this.decide.differs(theirs, mine, node)) this.conflict(node, segments, baseMissing ? MISSING : base, mine, theirs, undefined);
      return;
    }
    const orderIdKey = here[0]?.orderIdKey;
    if (orderIdKey !== undefined && Array.isArray(mine) && Array.isArray(theirs)) this.carryOrder(node, segments, mine, theirs, orderIdKey, here);
    if (here.length === carried.length) return;
    if (Array.isArray(mine) || Array.isArray(theirs)) {
      const lists = [mine, theirs].map((side) => (Array.isArray(side) ? (side as unknown[]) : []));
      lists.forEach((items, outside) =>
        items.forEach((item, index) => {
          const step = carried
            .map((r) => r.segments[depth])
            .find((s): s is IdSegment => s !== undefined && 'idKey' in s && idOf(item, s.idKey) === idMapKey(s.id));
          if (!step) return;
          const counterpart = lists[1 - outside]!.find((other) => idOf(other, step.idKey) === idMapKey(step.id));
          // An item of `theirs` also in `mine` was visited with it.
          if (outside && counterpart !== undefined) return;
          const child = this.decide.indexChild(node, index, item, outside ? 'baseline' : 'values');
          const sub = this.under(carried, depth, step);
          if (outside) this.carry(MISSING, item, child, [...segments, step], sub);
          else this.carry(item, counterpart === undefined ? MISSING : counterpart, child, [...segments, step], sub);
        }),
      );
      return;
    }
    const m = isPlainObject(mine) ? mine : {};
    const t = isPlainObject(theirs) ? theirs : {};
    for (const key of new Set([...Object.keys(m), ...Object.keys(t)])) {
      const step = { key };
      const sub = this.under(carried, depth, step);
      if (sub.length > 0) this.carry(own(m, key), own(t, key), this.decide.keyChild(node, key), [...segments, step], sub);
    }
  }
}

/** `rebaseInternal` with `carried`, the conflicts of the earlier rebases still open on `options.values`. */
export function rebaseCarrying<Values extends object>(options: RebaseOptions<Values>, carried: readonly ConflictRecord[]): RebaseComputation<Values> {
  return rebaseInternal(options, (merge) => new CarryingMerger(merge, carried));
}
