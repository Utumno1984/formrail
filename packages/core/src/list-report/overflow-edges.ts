/**
 * How far the content may overflow, or how far it may be from an edge, and still count as "all in
 * view": scroll positions are fractional under browser zoom (110%, 90%) while `scrollWidth` and
 * `clientWidth` are rounded, so an exact comparison would leave a shade that hides nothing.
 */
export const OVERFLOW_EDGE_TOLERANCE_PX = 1;

export interface OverflowEdges {
  /** The content is wider than the scrollport by more than the tolerance. */
  overflow: boolean;
  /** Content is hidden past the inline start (scrolled away from it). */
  start: boolean;
  /** Content is hidden past the inline end (not scrolled to the end yet). */
  end: boolean;
}

/**
 * Which inline edges of a scroll container hide content. `fromStart` is the distance scrolled from
 * the inline start, whatever the direction (see `scrollFromStart`): in `rtl` it is the opposite of the
 * standard negative `scrollLeft`. Every edge is "in view" within {@link OVERFLOW_EDGE_TOLERANCE_PX}.
 */
export function overflowEdges(fromStart: number, scrollWidth: number, clientWidth: number): OverflowEdges {
  const max = scrollWidth - clientWidth;
  if (!(max > OVERFLOW_EDGE_TOLERANCE_PX)) return { overflow: false, start: false, end: false };
  // An overscroll (rubber band on touch) needs no clamp: past the start `fromStart` is negative (start
  // false, end true), past the end it is above `max` (start true, end false).
  return {
    overflow: true,
    start: fromStart > OVERFLOW_EDGE_TOLERANCE_PX,
    end: max - fromStart > OVERFLOW_EDGE_TOLERANCE_PX,
  };
}
