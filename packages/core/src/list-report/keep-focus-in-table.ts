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
