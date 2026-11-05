import { computeRange, layoutSegments, sameRange, scrollTopForIndex, type VirtualSegment } from './virtual-rows';

const rowsCovered = (segments: VirtualSegment[]) =>
  segments.reduce((n, s) => n + (s.type === 'spacer' ? s.rows : s.end - s.start), 0);
const mounted = (segments: VirtualSegment[]) =>
  segments.flatMap((s) => (s.type === 'rows' ? Array.from({ length: s.end - s.start }, (_, i) => s.start + i) : []));

/** The bound of the ticket: ceil(viewport / pitch) + 2 * overscan + 1. */
const bound = (viewport: number, pitch: number, overscan: number) => Math.ceil(viewport / pitch) + 2 * overscan + 1;

describe('computeRange', () => {
  it('at the start: from 0, the visible rows plus the overscan below', () => {
    expect(computeRange(0, 470, 47, 10, 100_000)).toEqual({ start: 0, end: 20 });
  });

  it('in the middle: overscan on both sides', () => {
    // first visible = 1000, last = ceil((47000 + 470) / 47) = 1010
    expect(computeRange(47_000, 470, 47, 10, 100_000)).toEqual({ start: 990, end: 1020 });
  });

  it('at the end: the last row is mounted, overscan clipped at the boundary', () => {
    const count = 100_000;
    const range = computeRange(count * 47 - 470, 470, 47, 10, count);
    expect(range.end).toBe(count);
    expect(range.start).toBe(count - 10 - 10);
  });

  it('overscan at the top boundary is clipped (no negative start)', () => {
    expect(computeRange(47 * 3, 470, 47, 10, 1000).start).toBe(0);
  });

  it('a viewport taller than the content mounts every row', () => {
    expect(computeRange(0, 2000, 47, 10, 7)).toEqual({ start: 0, end: 7 });
    expect(computeRange(500, 2000, 47, 10, 7)).toEqual({ start: 0, end: 7 });
  });

  it('a fractional scrollTop stays within the bound and covers the viewport', () => {
    for (const top of [0.5, 23.3, 46.99, 47.01, 12_345.678]) {
      const r = computeRange(top, 470, 47, 10, 100_000);
      expect(r.end - r.start).toBeLessThanOrEqual(bound(470, 47, 10));
      expect(r.start * 47).toBeLessThanOrEqual(top);
      expect(r.end * 47).toBeGreaterThanOrEqual(top + 470);
    }
  });

  it('a non-integer pitch (e.g. 44.25px) covers the viewport without drifting over 100,000 rows', () => {
    const pitch = 44.25;
    const count = 100_000;
    for (const top of [0, 1000.5, 2_212_499.9, count * pitch - 600]) {
      const r = computeRange(top, 600, pitch, 10, count);
      expect(r.end - r.start).toBeLessThanOrEqual(bound(600, pitch, 10));
      expect(r.start * pitch).toBeLessThanOrEqual(top + 1e-6);
      expect(Math.min(count * pitch, r.end * pitch)).toBeGreaterThanOrEqual(Math.min(count * pitch, top + 600) - 1e-6);
    }
  });

  it('0 rows: an empty range', () => {
    expect(computeRange(0, 470, 47, 10, 0)).toEqual({ start: 0, end: 0 });
    expect(computeRange(9999, 470, 47, 10, 0)).toEqual({ start: 0, end: 0 });
  });

  it('1 row: that row', () => {
    expect(computeRange(0, 470, 47, 10, 1)).toEqual({ start: 0, end: 1 });
    expect(computeRange(1e6, 470, 47, 10, 1)).toEqual({ start: 0, end: 1 });
  });

  it('count shrinks with scrollTop beyond the new end: clamped, no exception, the last rows mounted', () => {
    // scrolled to row 90,000 of 100,000; the filter leaves 50 rows
    expect(() => computeRange(90_000 * 47, 470, 47, 10, 50)).not.toThrow();
    const r = computeRange(90_000 * 47, 470, 47, 10, 50);
    expect(r.end).toBe(50);
    expect(r.start).toBeGreaterThanOrEqual(0);
    expect(r.end - r.start).toBeGreaterThan(0);
  });

  it('overscan 0: an unaligned scroll still covers the viewport', () => {
    const r = computeRange(20, 470, 47, 0, 1000);
    expect(r.start).toBe(0);
    expect(r.end * 47).toBeGreaterThanOrEqual(20 + 470);
  });

  it('every position over 100,000 rows stays within ceil(viewport / pitch) + 2 * overscan + 1', () => {
    const count = 100_000;
    for (let top = 0; top < count * 47; top += 9_973.37) {
      const r = computeRange(top, 653, 47, 10, count);
      expect(r.end - r.start).toBeLessThanOrEqual(bound(653, 47, 10));
    }
  });

  it('invalid inputs never throw (NaN scroll, negative overscan, no viewport yet)', () => {
    expect(computeRange(Number.NaN, 470, 47, 10, 100)).toEqual({ start: 0, end: 20 });
    expect(computeRange(0, 470, 47, -3, 100)).toEqual({ start: 0, end: 10 });
    expect(computeRange(0, 0, 47, 10, 100)).toEqual({ start: 0, end: 100 });
  });
});

describe('layoutSegments', () => {
  it('no pinned row: top spacer, range, bottom spacer', () => {
    const s = layoutSegments({ start: 990, end: 1020 }, 100_000, null);
    expect(s).toEqual([
      { type: 'spacer', key: 'top', rows: 990 },
      { type: 'rows', start: 990, end: 1020 },
      { type: 'spacer', key: 'bottom', rows: 100_000 - 1020 },
    ]);
    expect(rowsCovered(s)).toBe(100_000);
  });

  it('at the start: no top spacer', () => {
    expect(layoutSegments({ start: 0, end: 20 }, 1000, undefined)[0]).toEqual({ type: 'rows', start: 0, end: 20 });
  });

  it('pinned row (focus) above the range: separate spacers before and after it', () => {
    const s = layoutSegments({ start: 990, end: 1020 }, 100_000, 12);
    expect(s).toEqual([
      { type: 'spacer', key: 'top', rows: 12 },
      { type: 'rows', start: 12, end: 13 },
      { type: 'spacer', key: 'mid', rows: 990 - 13 },
      { type: 'rows', start: 990, end: 1020 },
      { type: 'spacer', key: 'bottom', rows: 100_000 - 1020 },
    ]);
    expect(rowsCovered(s)).toBe(100_000);
  });

  it('pinned row below the range', () => {
    const s = layoutSegments({ start: 0, end: 20 }, 100_000, 50_000);
    expect(s).toEqual([
      { type: 'rows', start: 0, end: 20 },
      { type: 'spacer', key: 'mid', rows: 50_000 - 20 },
      { type: 'rows', start: 50_000, end: 50_001 },
      { type: 'spacer', key: 'bottom', rows: 100_000 - 50_001 },
    ]);
    expect(rowsCovered(s)).toBe(100_000);
  });

  it('pinned row adjacent to the range: no 0-row spacer', () => {
    const above = layoutSegments({ start: 10, end: 30 }, 100, 9);
    expect(above.some((x) => x.type === 'spacer' && x.key === 'mid')).toBe(false);
    expect(mounted(above)).toEqual([9, ...Array.from({ length: 20 }, (_, i) => 10 + i)]);
    const below = layoutSegments({ start: 10, end: 30 }, 100, 30);
    expect(mounted(below).at(-1)).toBe(30);
    expect(rowsCovered(below)).toBe(100);
  });

  it('pinned row inside the range, out of bounds or not an integer: ignored', () => {
    const plain = layoutSegments({ start: 10, end: 30 }, 100, null);
    expect(layoutSegments({ start: 10, end: 30 }, 100, 15)).toEqual(plain);
    expect(layoutSegments({ start: 10, end: 30 }, 100, 100)).toEqual(plain);
    expect(layoutSegments({ start: 10, end: 30 }, 100, -1)).toEqual(plain);
    expect(layoutSegments({ start: 10, end: 30 }, 100, 2.5)).toEqual(plain);
  });

  it('0 rows: nothing at all', () => {
    expect(layoutSegments({ start: 0, end: 0 }, 0, null)).toEqual([]);
    expect(layoutSegments({ start: 0, end: 0 }, 0, 0)).toEqual([]);
  });

  it('a range past a shrunk count is clipped to it', () => {
    const s = layoutSegments({ start: 90, end: 120 }, 50, null);
    expect(rowsCovered(s)).toBe(50);
  });
});

describe('sameRange', () => {
  it('compares start and end', () => {
    expect(sameRange({ start: 1, end: 2 }, { start: 1, end: 2 })).toBe(true);
    expect(sameRange({ start: 1, end: 2 }, { start: 1, end: 3 })).toBe(false);
  });
});

describe('scrollTopForIndex', () => {
  const base = { pitch: 47, bodyStart: 45, stickyHeight: 45, clientHeight: 500, scrollTop: 0 };

  it('auto: no scroll when the row is fully visible under the header', () => {
    expect(scrollTopForIndex({ ...base, index: 3, align: 'auto' })).toBeNull();
  });

  it('auto: a row below the viewport ends at the bottom edge', () => {
    // row 100: top = 45 + 4700, bottom = 4792 -> scrollTop = 4792 - 500
    expect(scrollTopForIndex({ ...base, index: 100, align: 'auto' })).toBe(4292);
  });

  it('auto: a row above (under the sticky header) starts right below the header', () => {
    const top = scrollTopForIndex({ ...base, scrollTop: 10_000, index: 100, align: 'auto' });
    expect(top).toBe(45 + 4700 - 45);
  });

  it('start / end / center relative to the body area', () => {
    expect(scrollTopForIndex({ ...base, index: 100, align: 'start' })).toBe(4700);
    expect(scrollTopForIndex({ ...base, index: 100, align: 'end' })).toBe(4292);
    // centre of the row (4745 + 23.5) at the centre of the body area (45 + 455 / 2)
    expect(scrollTopForIndex({ ...base, index: 100, align: 'center' })).toBeCloseTo(4745 + 23.5 - 45 - 227.5);
  });

  it('never negative', () => {
    expect(scrollTopForIndex({ ...base, scrollTop: 300, index: 0, align: 'end' })).toBe(0);
    expect(scrollTopForIndex({ ...base, scrollTop: 300, index: 0, align: 'center' })).toBe(0);
  });
});
