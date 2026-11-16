import type { RefObject } from 'react';
import { scrollFromStart } from '../internal/rtl-scroll';
import { useResizeAndMutationEffect } from '../utils/use-resize-and-mutation-effect';
import { overflowEdges } from './overflow-edges';

/** Attributes set on the scroll container while content is hidden past that inline edge. */
export const OVERFLOW_START_ATTR = 'data-rop-overflow-start';
export const OVERFLOW_END_ATTR = 'data-rop-overflow-end';

/**
 * Where the edge layer must draw its shades, in px, or `null` when nothing overflows sideways (no
 * layer at all). `height` is the scrollport's (`clientHeight`); `bottom` moves the shades down from
 * the layer, which sits right after the table: a table shorter than the scrollport leaves room below
 * it that the shades cover too (0 when the table fills it). Nothing about the direction: the shades
 * follow the resolved direction in CSS alone (see `edgeShadowStartClass`): the geometry itself holds
 * nothing about it. (A `dir` changed after the mount still measures once, in `useOverflowEdges`: Firefox
 * moves `scrollLeft` back to the start without a `scroll` event, and which shade shows depends on it.)
 */
export interface OverflowEdgesGeometry {
  height: number;
  bottom: number;
}

export interface OverflowEdgesSink {
  setGeometry: (geometry: OverflowEdgesGeometry | null) => void;
}

/** Whether `node` is `el` or one of its ancestors in the composed tree (a `ShadowRoot` leads to its host). */
function isAncestorOrSelf(node: Node, el: Element): boolean {
  for (let n: Node | null = el; n; n = n instanceof ShadowRoot ? n.host : n.parentNode) {
    if (n === node) return true;
  }
  return false;
}

/**
 * Tracks which inline edges of the List Report's scroll container hide columns. The state is written
 * on the container itself, as `data-rop-overflow-start` / `data-rop-overflow-end` (present or absent),
 * straight to the DOM: a scroll never renders anything, and an attribute is touched only when its
 * boolean changes. The geometry of the shades goes to `sink` (the edge layer's handle), only when the
 * container or the table is resized.
 *
 * Measured on the client only, in a layout effect (before the first paint) and then on every resize
 * of the container or of the table (columns, rows, a rotated tablet, a panel resized, a tab shown after
 * `display: none`), on every horizontal scroll (touch inertia and keyboard scrolling included: the
 * last `scroll` event gives the final state) and on every change of a `dir` attribute on the container
 * or on one of its ancestors. A vertical scroll returns at once.
 *
 * Why `dir` needs an observer: a change of direction moves the scroll position back to the inline
 * start of the new direction, and not every browser says so. Chromium fires a `scroll` event; Firefox
 * does not, and the attributes would keep the old state until the next scroll (a start shade over no
 * hidden column). The observer watches the `dir` attribute in the whole document (and in every
 * `ShadowRoot` the container is nested in, outwards to the document) and measures again only when it
 * changes on the container or on one of its ancestors, walked up through the hosts of `ShadowRoot`s: a `dir`
 * changed on a sibling or in another branch measures nothing, however many tables are mounted.
 * Limit: the ancestors are those of the DOM tree (`parentNode`, then the `host` of a `ShadowRoot`), not
 * of the flat tree. A container slotted into a host whose `ShadowRoot` sets `dir` on the `slot` or above
 * it is not seen (the `dir` of the host and of its light-DOM ancestors is).
 * Limit: a direction changed through the CSS `direction` property alone (a class, a style sheet), with
 * no `dir` attribute changing, fires nothing an observer can see at a low cost; it is measured at the
 * next scroll or resize. The shades are still drawn on the correct sides (CSS alone, see
 * `edgeShadowStartClass`); only which of them shows can be stale.
 */
export function useOverflowEdges(containerRef: RefObject<HTMLElement | null>, sinkRef: RefObject<OverflowEdgesSink | null>): void {
  useResizeAndMutationEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    let start = false;
    let end = false;
    let overflow = false;
    let lastLeft: number | undefined;
    let geometry: OverflowEdgesGeometry | null = null;

    const measureGeometry = (): OverflowEdgesGeometry | null => {
      if (!overflow) return null;
      const height = el.clientHeight;
      const table = el.firstElementChild;
      const tableHeight = table ? table.getBoundingClientRect().height : height;
      // Floored: the shades must never reach past the scrollport and make it scroll.
      return { height, bottom: -Math.max(0, Math.floor(height - tableHeight)) };
    };
    const publish = (next: OverflowEdgesGeometry | null) => {
      if (next === geometry || (next && geometry && next.height === geometry.height && next.bottom === geometry.bottom)) return;
      geometry = next;
      sinkRef.current?.setGeometry(next);
    };
    const measure = (resized: boolean) => {
      // The direction only says how to read `scrollLeft` (negative in rtl), not where the shades go (CSS).
      // A change of direction after the mount is measured by the `dir` observer below.
      const rtl = getComputedStyle(el).direction === 'rtl';
      const edges = overflowEdges(scrollFromStart(el, rtl), el.scrollWidth, el.clientWidth);
      if (edges.start !== start) {
        start = edges.start;
        el.toggleAttribute(OVERFLOW_START_ATTR, start);
      }
      if (edges.end !== end) {
        end = edges.end;
        el.toggleAttribute(OVERFLOW_END_ATTR, end);
      }
      const overflowChanged = edges.overflow !== overflow;
      overflow = edges.overflow;
      if (resized || overflowChanged) publish(measureGeometry());
    };
    const onScroll = () => {
      const left = el.scrollLeft;
      if (left === lastLeft) return;
      lastLeft = left;
      measure(false);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    // A `dir` changed on the container or on an ancestor (one inside the container cannot change its
    // direction). Firefox moves `scrollLeft` back to the start with no `scroll` event: read it here.
    const dirs =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver((records) => {
            if (!records.some((r) => isAncestorOrSelf(r.target, el))) return;
            lastLeft = el.scrollLeft;
            measure(false);
          });
    if (dirs) {
      const options: MutationObserverInit = { attributes: true, attributeFilter: ['dir'], subtree: true };
      dirs.observe(el.ownerDocument.documentElement, options);
      // A `ShadowRoot` is not in the document's subtree: its own `dir` attributes are watched there, in
      // every one the container is nested in (the host of one is in the next one out).
      for (let root = el.getRootNode(); root instanceof ShadowRoot; root = root.host.getRootNode()) dirs.observe(root, options);
    }
    return {
      target: el,
      // The table is the first child: its box changes with the columns and the rows.
      children: true,
      update: () => {
        lastLeft = el.scrollLeft;
        measure(true);
      },
      cleanup: () => {
        el.removeEventListener('scroll', onScroll);
        dirs?.disconnect();
        el.removeAttribute(OVERFLOW_START_ATTR);
        el.removeAttribute(OVERFLOW_END_ATTR);
      },
    };
  }, [containerRef, sinkRef]);
}
