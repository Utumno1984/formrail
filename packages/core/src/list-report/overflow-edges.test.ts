// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { OVERFLOW_EDGE_TOLERANCE_PX, overflowEdges } from './overflow-edges';

describe('overflowEdges', () => {
  it('the tolerance is 1px', () => {
    expect(OVERFLOW_EDGE_TOLERANCE_PX).toBe(1);
  });

  it('content that fits, or overflows by the tolerance at most: no edge', () => {
    expect(overflowEdges(0, 300, 300)).toEqual({ overflow: false, start: false, end: false });
    expect(overflowEdges(0, 200, 300)).toEqual({ overflow: false, start: false, end: false });
    // 1px of overflow (a rounding of the zoom): no shade that hides nothing.
    expect(overflowEdges(0, 301, 300)).toEqual({ overflow: false, start: false, end: false });
    expect(overflowEdges(1, 301, 300)).toEqual({ overflow: false, start: false, end: false });
  });

  it('at the start: only the end hides content', () => {
    expect(overflowEdges(0, 800, 300)).toEqual({ overflow: true, start: false, end: true });
  });

  it('in the middle: both edges', () => {
    expect(overflowEdges(250, 800, 300)).toEqual({ overflow: true, start: true, end: true });
  });

  it('at the end, within 1px (fractional zoom): only the start', () => {
    expect(overflowEdges(500, 800, 300)).toEqual({ overflow: true, start: true, end: false });
    expect(overflowEdges(499.4, 800, 300)).toEqual({ overflow: true, start: true, end: false });
    expect(overflowEdges(499, 800, 300)).toEqual({ overflow: true, start: true, end: false });
    // 1.5px from the end is a real overflow.
    expect(overflowEdges(498.5, 800, 300)).toEqual({ overflow: true, start: true, end: true });
  });

  it('near the start, within 1px: the start is in view', () => {
    expect(overflowEdges(0.6, 800, 300)).toEqual({ overflow: true, start: false, end: true });
    expect(overflowEdges(1, 800, 300)).toEqual({ overflow: true, start: false, end: true });
    expect(overflowEdges(1.5, 800, 300)).toEqual({ overflow: true, start: true, end: true });
  });

  it('an overscroll (rubber band) past either end reads as that end', () => {
    expect(overflowEdges(-20, 800, 300)).toEqual({ overflow: true, start: false, end: true });
    expect(overflowEdges(540, 800, 300)).toEqual({ overflow: true, start: true, end: false });
  });

  it('a 2px overflow: one edge at a time', () => {
    expect(overflowEdges(0, 302, 300)).toEqual({ overflow: true, start: false, end: true });
    expect(overflowEdges(2, 302, 300)).toEqual({ overflow: true, start: true, end: false });
  });

  it('a container without layout (0 x 0, e.g. `display: none`): no edge', () => {
    expect(overflowEdges(0, 0, 0)).toEqual({ overflow: false, start: false, end: false });
  });
});
