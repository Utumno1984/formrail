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
 * it that the shades cover too (0 when the table fills it).
 */
export interface OverflowEdgesGeometry {
  height: number;
  bottom: number;
}

export interface OverflowEdgesSink {
  setGeometry: (geometry: OverflowEdgesGeometry | null) => void;
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
 * `display: none`) and on every horizontal scroll (touch inertia and keyboard scrolling included: the
 * last `scroll` event gives the final state). A vertical scroll returns at once.
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
        el.removeAttribute(OVERFLOW_START_ATTR);
        el.removeAttribute(OVERFLOW_END_ATTR);
      },
    };
  }, [containerRef, sinkRef]);
}
