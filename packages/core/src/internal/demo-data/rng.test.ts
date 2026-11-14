// @vitest-environment node
import { createPermutation, createRng, createRowRng, hashSeed, rowSeed } from './rng';

const take = (seed: number | string, count = 50) => {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.uint32());
};

describe('createRng', () => {
  it('gives identical sequences for the same seed (number or string)', () => {
    expect(take(42)).toEqual(take(42));
    expect(take('customers')).toEqual(take('customers'));
  });

  it('gives different sequences for different seeds', () => {
    expect(take(42)).not.toEqual(take(43));
    expect(take('a')).not.toEqual(take('b'));
    expect(take(0)).not.toEqual(take(1));
  });

  it('is pinned: the first values of a seed never change across engines and releases', () => {
    // Changing the algorithm would silently change every demo record and visual baseline.
    expect(take('demo', 3)).toEqual([4025708835, 2301949648, 2041545123]);
  });

  it('next() stays in [0, 1) and int() in its inclusive bounds', () => {
    const rng = createRng('bounds');
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const n = rng.int(-2, 2);
      expect(n).toBeGreaterThanOrEqual(-2);
      expect(n).toBeLessThanOrEqual(2);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([-1, -2, 0, 1, 2].sort());
  });

  it('rejects invalid arguments loudly', () => {
    const rng = createRng(1);
    expect(() => rng.int(3, 1)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
    expect(() => rng.weighted([['a', 0]])).toThrow(RangeError);
    expect(() => createRng(Number.NaN)).toThrow(RangeError);
  });

  it('weighted() respects the weights', () => {
    const rng = createRng('weights');
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 20000; i++) counts[rng.weighted([['a', 1], ['b', 3], ['c', 0]] as const)]++;
    expect(counts.c).toBe(0);
    expect(counts.b / counts.a).toBeGreaterThan(2.6);
    expect(counts.b / counts.a).toBeLessThan(3.4);
  });

  it('row seeds depend on the dataset seed and the index only', () => {
    const seed = hashSeed('x');
    expect(rowSeed(seed, 7)).toBe(rowSeed(seed, 7));
    expect(rowSeed(seed, 7)).not.toBe(rowSeed(seed, 8));
    expect(rowSeed(seed, 7)).not.toBe(rowSeed(hashSeed('y'), 7));
    expect(createRowRng(seed, 3).uint32()).toBe(createRowRng(seed, 3).uint32());
  });
});

describe('createPermutation', () => {
  it.each([1, 2, 3, 7, 64, 100, 1000, 2079, 4097])('is a bijection of [0, %i)', (size) => {
    const permute = createPermutation(size, 'p');
    const seen = new Set<number>();
    for (let i = 0; i < size; i++) {
      const slot = permute(i);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(size);
      seen.add(slot);
    }
    expect(seen.size).toBe(size);
  });

  it('wraps past its size and depends on the seed', () => {
    const permute = createPermutation(100, 'p');
    expect(permute(105)).toBe(permute(5));
    const other = createPermutation(100, 'q');
    expect(Array.from({ length: 100 }, (_, i) => permute(i))).not.toEqual(Array.from({ length: 100 }, (_, i) => other(i)));
  });

  it('rejects an invalid size', () => {
    expect(() => createPermutation(0, 'p')).toThrow(RangeError);
    expect(() => createPermutation(1.5, 'p')).toThrow(RangeError);
  });
});
