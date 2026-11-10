import { useCallback, useLayoutEffect, useRef } from 'react';

/** The scroll container of the List Report table that holds `node` (the `<table>`'s parent), if any. */
export const tableContainerOf = (node: Element | null | undefined): HTMLElement | null =>
  node?.closest('table')?.parentElement ?? null;

/**
 * Call it while the nodes of `owners` are still in the document, just before they go away (a layout
 * cleanup: React runs it before removing the DOM of the unmounted subtree). When one of them holds
 * the focus, the focus would fall on `body` with their removal: once the frame is over (overlays
 * return the focus in one too) it goes to the table's scroll container instead, unless something
 * else took it by then or the table went away as well.
 */
export function keepFocusInTable(container: HTMLElement | null, owners: readonly (Element | null | undefined)[]): void {
  const active = document.activeElement;
  if (!container || !active || active === document.body) return;
  if (!owners.some((owner) => owner?.contains(active))) return;
  requestAnimationFrame(() => {
    const now = document.activeElement;
    if (container.isConnected && (!now || now === document.body || !now.isConnected)) container.focus({ preventScroll: true });
  });
}

/**
 * Keeps the focus in the table when the owners of the focus go away with the component: registers the
 * layout cleanup that calls `keepFocusInTable`, and caches the table's scroll container. One strategy
 * for every user of this rule (rows, trigger menus, inline buttons): the container is cached while a
 * node is in the document (`capture`, from a ref callback) instead of being derived at cleanup, because
 * it is also needed after the node is gone (a `returnFocusRef` read by a dialog that closes later).
 * `owners` is read at cleanup, so it can read refs filled after the first render.
 */
export function useKeepFocusInTable(owners: () => readonly (Element | null | undefined)[]) {
  const containerRef = useRef<HTMLElement | null>(null);
  const ownersRef = useRef(owners);
  ownersRef.current = owners;
  const capture = useCallback((node: Element | null) => {
    if (node) containerRef.current = tableContainerOf(node);
  }, []);
  useLayoutEffect(() => () => keepFocusInTable(containerRef.current, ownersRef.current()), []);
  return { containerRef, capture };
}
