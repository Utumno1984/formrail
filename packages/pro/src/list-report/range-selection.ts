// Range selection (shift-click / Shift+Space) on the indices of the CURRENT results, pure.
// Works on ids, never on the DOM: the anchor can be unmounted (virtualized) or outside the viewport.

/**
 * The ids from `anchorIndex` to `targetIndex` (both included, in either order) among `resultIds`.
 * O(k), k = width of the range. Out-of-bounds indices are clamped; an empty `resultIds` gives `[]`.
 */
export function rangeIds(resultIds: readonly string[], anchorIndex: number, targetIndex: number): string[] {
  const n = resultIds.length;
  if (n === 0) return [];
  const clamp = (i: number) => Math.min(n - 1, Math.max(0, Math.floor(i)));
  const from = Math.min(clamp(anchorIndex), clamp(targetIndex));
  const to = Math.max(clamp(anchorIndex), clamp(targetIndex));
  return resultIds.slice(from, to + 1);
}

/**
 * The selection after a range gesture: every id of the range takes the state `select` (the state the
 * clicked row gets from the gesture), the rest of `selected` — ids outside the range, hidden by the
 * filters or no longer in the data — is kept as it is. Always a new `Set` (`setSelectedIds` wants one).
 * O(|selected| + k).
 */
export function applyRange(selected: ReadonlySet<string>, ids: readonly string[], select: boolean): Set<string> {
  const next = new Set(selected);
  if (select) for (const id of ids) next.add(id);
  else for (const id of ids) next.delete(id);
  return next;
}
