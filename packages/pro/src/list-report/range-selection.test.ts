import { applyRange, rangeIds } from './range-selection';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`);

describe('rangeIds', () => {
  it('anchor before the target', () => {
    expect(rangeIds(ids(10), 2, 5)).toEqual(['r2', 'r3', 'r4', 'r5']);
  });

  it('anchor after the target: same ids, in result order', () => {
    expect(rangeIds(ids(10), 5, 2)).toEqual(['r2', 'r3', 'r4', 'r5']);
  });

  it('anchor equal to the target: that id alone', () => {
    expect(rangeIds(ids(10), 4, 4)).toEqual(['r4']);
  });

  it('out-of-bounds indices are clamped; no results gives nothing', () => {
    expect(rangeIds(ids(3), -5, 99)).toEqual(['r0', 'r1', 'r2']);
    expect(rangeIds([], 0, 3)).toEqual([]);
  });

  it('100,000 results: O(k), only the k ids of the range are produced', () => {
    const all = ids(100_000);
    const slice = vi.spyOn(all, 'slice');
    const range = rangeIds(all, 9, 4999);
    expect(range).toHaveLength(4991);
    expect(range[0]).toBe('r9');
    expect(range.at(-1)).toBe('r4999');
    // one slice of the range, no pass over the whole array
    expect(slice).toHaveBeenCalledTimes(1);
    expect(slice).toHaveBeenCalledWith(9, 5000);
  });
});

describe('applyRange', () => {
  it('select: adds the range and keeps the rest (hidden ids included)', () => {
    const next = applyRange(new Set(['hidden', 'r0']), ['r2', 'r3'], true);
    expect([...next].sort()).toEqual(['hidden', 'r0', 'r2', 'r3']);
  });

  it('deselect: removes the whole range, keeps what is outside it', () => {
    const next = applyRange(new Set(['r1', 'r2', 'r3', 'r9']), ['r1', 'r2', 'r3'], false);
    expect([...next]).toEqual(['r9']);
  });

  it('always a new Set, the input is never mutated', () => {
    const input = new Set(['a']);
    const next = applyRange(input, ['b'], true);
    expect(next).not.toBe(input);
    expect([...input]).toEqual(['a']);
  });
});
