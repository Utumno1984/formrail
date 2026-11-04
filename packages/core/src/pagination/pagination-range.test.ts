import { describe, expect, it } from 'vitest';
import { getPaginationRange, paginationSlotCount, toInt } from './pagination-range';

const run = (page: number, pageCount: number, siblingCount = 1, boundaryCount = 1) =>
  getPaginationRange({ page, pageCount, siblingCount, boundaryCount });

describe('getPaginationRange', () => {
  it('lists every page when they fit', () => {
    expect(run(1, 1)).toEqual([1]);
    expect(run(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('matches the known shapes for 120 pages', () => {
    expect(run(1, 120)).toEqual([1, 2, 3, 4, 5, 'end-ellipsis', 120]);
    expect(run(4, 120)).toEqual([1, 2, 3, 4, 5, 'end-ellipsis', 120]);
    expect(run(5, 120)).toEqual([1, 'start-ellipsis', 4, 5, 6, 'end-ellipsis', 120]);
    expect(run(60, 120)).toEqual([1, 'start-ellipsis', 59, 60, 61, 'end-ellipsis', 120]);
    expect(run(116, 120)).toEqual([1, 'start-ellipsis', 115, 116, 117, 'end-ellipsis', 120]);
    expect(run(117, 120)).toEqual([1, 'start-ellipsis', 116, 117, 118, 119, 120]);
    expect(run(120, 120)).toEqual([1, 'start-ellipsis', 116, 117, 118, 119, 120]);
  });

  it('has a constant number of slots for every page, every pageCount 1-50 and every sibling/boundary pair', () => {
    for (const siblingCount of [0, 1, 2, 3]) {
      for (const boundaryCount of [0, 1, 2, 3]) {
        const slots = paginationSlotCount(siblingCount, boundaryCount);
        for (let pageCount = 1; pageCount <= 50; pageCount++) {
          const expected = Math.min(pageCount, slots);
          for (let page = 1; page <= pageCount; page++) {
            const items = run(page, pageCount, siblingCount, boundaryCount);
            expect(items, `s${siblingCount} b${boundaryCount} ${page}/${pageCount}`).toHaveLength(expected);
            const numbers = items.filter((i): i is number => typeof i === 'number');
            // the current page is always visible, numbers ascend strictly, in range
            expect(numbers).toContain(page);
            expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
            expect(new Set(numbers).size).toBe(numbers.length);
            expect(numbers.every((n) => n >= 1 && n <= pageCount)).toBe(true);
            if (boundaryCount >= 1) {
              expect(numbers[0]).toBe(1);
              expect(numbers[numbers.length - 1]).toBe(pageCount);
            }
          }
        }
      }
    }
  }, 60_000);

  it('an ellipsis always hides at least two pages (otherwise the number is shown)', () => {
    for (let pageCount = 8; pageCount <= 40; pageCount++) {
      for (let page = 1; page <= pageCount; page++) {
        const items = run(page, pageCount);
        items.forEach((item, i) => {
          if (item === 'start-ellipsis' || item === 'end-ellipsis') {
            expect((items[i + 1] as number) - (items[i - 1] as number)).toBeGreaterThanOrEqual(3);
          }
        });
      }
    }
  });

  it('honours siblingCount and boundaryCount', () => {
    expect(run(50, 100, 2, 2)).toEqual([1, 2, 'start-ellipsis', 48, 49, 50, 51, 52, 'end-ellipsis', 99, 100]);
    expect(run(50, 100, 0, 1)).toEqual([1, 'start-ellipsis', 50, 'end-ellipsis', 100]);
    expect(run(50, 100, 1, 0)).toEqual(['start-ellipsis', 49, 50, 51, 'end-ellipsis']);
  });

  it('is cheap for a huge pageCount', () => {
    expect(run(5_000_000, 10_000_000)).toHaveLength(7);
  });
});

describe('toInt', () => {
  it('floors, clamps and replaces non-finite values', () => {
    expect(toInt(3.9, 1, 1)).toBe(3);
    expect(toInt(0, 1, 1)).toBe(1);
    expect(toInt(-4, 0, 0)).toBe(0);
    expect(toInt(Number.NaN, 7, 0)).toBe(7);
    expect(toInt(Infinity, 7, 0)).toBe(7);
    expect(toInt('5', 7, 0)).toBe(7);
    expect(toInt(undefined, 7, 0)).toBe(7);
  });
});
