// Seeded pseudo-random numbers for the demo universe. Integer-only arithmetic (`Math.imul`, `>>>`), so
// the same seed gives the same sequence on every engine, platform and run: no `Math.random`, no clock.

/**
 * 32-bit hash of a seed. Strings go through FNV-1a (UTF-16 code units), numbers are truncated to
 * 32 bits; both then go through the MurmurHash3 finaliser so that close seeds give unrelated hashes.
 */
export function hashSeed(seed: number | string): number {
  let h: number;
  if (typeof seed === 'string') {
    h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  } else {
    if (!Number.isFinite(seed)) throw new RangeError(`createRng: the seed must be a finite number or a string, got ${seed}`);
    h = seed | 0;
  }
  return fmix32(h);
}

/** MurmurHash3 finaliser: an invertible 32-bit avalanche. */
function fmix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * The seed of row `index` of a dataset: a pure function of the dataset seed and the index, so row
 * `i` never depends on how many rows are generated (nor on which rows were generated before it).
 */
export function rowSeed(datasetSeed: number, index: number): number {
  return fmix32(datasetSeed ^ fmix32(Math.imul(index + 1, 0x9e3779b1)));
}

/** A deterministic random source (mulberry32). Not cryptographic: demo data only. */
export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = hashSeed(seed);
  }

  /** The next unsigned 32-bit integer. */
  uint32(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** A float in `[0, 1)`. */
  next(): number {
    return this.uint32() / 4294967296;
  }

  /** An integer in `[min, max]` (both inclusive). */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Rng.int: expected integers with min <= max, got ${min} and ${max}`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** One element of a non-empty list. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick: the list is empty');
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** `true` with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** One key of a list of `[value, weight]` pairs, with probability proportional to its weight. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    // Index loops, not `for (const [value, weight] of ...)`: tuple destructuring goes through the
    // iterator protocol, measurably slow on 100k-row datasets.
    let total = 0;
    for (let i = 0; i < entries.length; i++) total += entries[i]![1];
    if (!(total > 0)) throw new RangeError('Rng.weighted: the weights must add up to more than 0');
    let roll = this.next() * total;
    for (let i = 0; i < entries.length; i++) {
      roll -= entries[i]![1];
      if (roll < 0) return entries[i]![0];
    }
    return entries[entries.length - 1]![0];
  }
}

/** A new random source: the same seed always gives the same sequence. */
export function createRng(seed: number | string): Rng {
  return new Rng(seed);
}

/** The random source of row `index` of the dataset whose seed hash is `datasetSeed`. */
export function createRowRng(datasetSeed: number, index: number): Rng {
  return new Rng(rowSeed(datasetSeed, index));
}

/**
 * A pseudo-random **bijection** of `[0, size)`: every index maps to a distinct slot. Used to spread
 * the combinations of a name space (root x sector, first x last name, ...) over the rows so the first
 * `size` rows never repeat a combination, yet neighbouring rows look unrelated. Each round (add,
 * multiply by an odd constant, xor-shift, all modulo `2^bits`) is invertible on `bits`-bit integers;
 * cycle-walking keeps the result below `size`.
 */
export function createPermutation(size: number, seed: number | string): (index: number) => number {
  if (!Number.isInteger(size) || size < 1 || size > 2 ** 30) {
    throw new RangeError(`createPermutation: size must be an integer in [1, 2^30], got ${size}`);
  }
  let bits = 1;
  while (2 ** bits < size) bits++;
  const mask = 2 ** bits - 1;
  const shift = Math.ceil(bits / 2);
  const key = hashSeed(seed) & mask;
  const round = (x: number): number => {
    let y = (x + key) & mask;
    y = Math.imul(y, 0x2c1b3c6d) & mask;
    y ^= y >>> shift;
    y = Math.imul(y, 0x297a2d39) & mask;
    y ^= y >>> shift;
    return y;
  };
  return (index: number) => {
    let x = index % size;
    do x = round(x);
    while (x >= size);
    return x;
  };
}
