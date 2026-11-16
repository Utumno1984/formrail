// An ES build of `use-sync-external-store/shim/with-selector` for this workspace (ticket #508): the package ships
// CommonJS only, whose `require('react')` loads the root's React 19 whatever is aliased in vitest.config.ts, and
// TanStack Form's store (`@tanstack/react-store`) calls it in every `form.Field`. This is the same algorithm as
// use-sync-external-store 1.7.0 (MIT, Meta Platforms, Inc. and affiliates), on React 18's own `useSyncExternalStore`.
import { useDebugValue, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => Snapshot,
  getServerSnapshot: undefined | null | (() => Snapshot),
  selector: (snapshot: Snapshot) => Selection,
  isEqual?: (a: Selection, b: Selection) => boolean,
): Selection {
  const instRef = useRef<{ hasValue: boolean; value: Selection | null } | null>(null);
  if (instRef.current === null) instRef.current = { hasValue: false, value: null };
  const inst = instRef.current;
  const [getSelection, getServerSelection] = useMemo(() => {
    let hasMemo = false;
    let memoizedSnapshot: Snapshot;
    let memoizedSelection: Selection;
    const memoizedSelector = (nextSnapshot: Snapshot): Selection => {
      if (!hasMemo) {
        hasMemo = true;
        memoizedSnapshot = nextSnapshot;
        const nextSelection = selector(nextSnapshot);
        if (isEqual !== undefined && inst.hasValue) {
          const currentSelection = inst.value as Selection;
          if (isEqual(currentSelection, nextSelection)) return (memoizedSelection = currentSelection);
        }
        return (memoizedSelection = nextSelection);
      }
      const currentSelection = memoizedSelection;
      if (Object.is(memoizedSnapshot, nextSnapshot)) return currentSelection;
      const nextSelection = selector(nextSnapshot);
      if (isEqual !== undefined && isEqual(currentSelection, nextSelection)) {
        memoizedSnapshot = nextSnapshot;
        return currentSelection;
      }
      memoizedSnapshot = nextSnapshot;
      return (memoizedSelection = nextSelection);
    };
    const serverSnapshot = getServerSnapshot ?? null;
    return [() => memoizedSelector(getSnapshot()), serverSnapshot === null ? undefined : () => memoizedSelector(serverSnapshot())];
  }, [getSnapshot, getServerSnapshot, selector, isEqual, inst]);
  const value = useSyncExternalStore(subscribe, getSelection, getServerSelection);
  useEffect(() => {
    inst.hasValue = true;
    inst.value = value;
  }, [inst, value]);
  useDebugValue(value);
  return value;
}
