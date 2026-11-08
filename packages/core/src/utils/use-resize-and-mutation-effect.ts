import { useEffect, useLayoutEffect, type DependencyList } from 'react';

const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

export interface ResizeAndMutationSubscription {
  /** The element whose box is observed. */
  target: Element;
  /** Runs once when the subscription starts, then after every observed resize or change of children. */
  update: () => void;
  /** Runs when the subscription ends (a dependency changed, or unmount). */
  cleanup?: () => void;
  /**
   * Also observe the box of every direct child, and the addition or removal of direct children:
   * content can change width without the target's own box changing (a late web font, a new item).
   */
  children?: boolean;
}

/**
 * Re-runs a measurement whenever the layout it depends on may have changed. `setup` runs in a layout
 * effect (before paint) and returns what to observe, or nothing to skip the subscription; it re-runs
 * when `deps` change, like an effect. Without `ResizeObserver`, `update` still runs at the start (and
 * on child mutations when `children` is set).
 */
export function useResizeAndMutationEffect(
  setup: () => ResizeAndMutationSubscription | undefined,
  deps: DependencyList,
): void {
  // `setup` is the effect body: its freshness is governed by `deps`, as with `useLayoutEffect`
  // (the lint rule checks `deps` at every call site, see `additionalHooks` in the ESLint config).
  useIsomorphicLayoutEffect(() => {
    const subscription = setup();
    if (!subscription) return undefined;
    const { target, update, cleanup, children = false } = subscription;
    update();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => update());
    resize?.observe(target);
    // Children whose box is observed. Mutations only (un)observe the nodes they add or remove: a
    // re-observe of every child would cost O(children) per mutation, each with its own initial
    // ResizeObserver notification.
    const observed = new Set<Element>();
    const track = (node: Node) => {
      if (!resize || node.nodeType !== Node.ELEMENT_NODE || node.parentNode !== target) return;
      const element = node as Element;
      if (observed.has(element)) return;
      observed.add(element);
      resize.observe(element);
    };
    // A node removed and re-inserted in the same batch is still a child when the records are read:
    // only a node that is no longer a child is dropped (observing a detached node keeps it alive).
    const untrack = (node: Node) => {
      const element = node as Element;
      if (!resize || !observed.has(element) || node.parentNode === target) return;
      observed.delete(element);
      resize.unobserve(element);
    };
    let mutations: MutationObserver | null = null;
    if (children) {
      for (const child of Array.from(target.children)) track(child);
      if (typeof MutationObserver !== 'undefined') {
        mutations = new MutationObserver((records) => {
          for (const record of records) {
            record.removedNodes.forEach(untrack);
            record.addedNodes.forEach(track);
          }
          update();
        });
        mutations.observe(target, { childList: true });
      }
    }
    return () => {
      resize?.disconnect();
      mutations?.disconnect();
      cleanup?.();
    };
  }, deps);
}
