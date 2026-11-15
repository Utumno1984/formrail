import { describe, expect, it } from 'vitest';
import { measureLabels, proseDefaultOf, proseDefaultsOf } from './default-column-measure.mjs';

// #549, round 2: `proseDefaultsOf` reads EVERY value of the default a label key's prose states, for the value check
// of packages/core/test/label-defaults.ts. It is additive: `proseDefaultOf` and `checkLabels` (the guard) are
// unchanged, and the first value of the list is always the one `proseDefaultOf` reads.

describe('proseDefaultsOf: every value of the default the prose states', () => {
  it('reads a list joined by commas, `and`, `, and`, `or` and `/`', () => {
    expect(proseDefaultsOf('Visually hidden tone name. Default `Information`, `Success`, `Warning` and `Error`, by tone.')).toEqual([
      '`Information`',
      '`Success`',
      '`Warning`',
      '`Error`',
    ]);
    expect(proseDefaultsOf('Announced. Default `1 item selected` / `${n} items selected`.')).toEqual(['`1 item selected`', '`${n} items selected`']);
    expect(proseDefaultsOf('The count. Default: `(n)`, and `(n of m)` when a pill hides rows.')).toEqual(['`(n)`', '`(n of m)`']);
    expect(proseDefaultsOf('Default `a` or `b`.')).toEqual(['`a`', '`b`']);
    expect(proseDefaultsOf('Default: `No items`,\n`1 item`, `N items`.')).toEqual(['`No items`', '`1 item`', '`N items`']);
  });

  it('ends the list at the first text that is not a separator and a quoted value', () => {
    expect(proseDefaultsOf('Default: "1 result", "10,000 results", the number formatted in the `locale` of `useListReport`.')).toEqual([
      '"1 result"',
      '"10,000 results"',
    ]);
    expect(proseDefaultsOf('Kind of a `removed` entry. Default `removed` (see `added`).')).toEqual(['`removed`']);
    expect(proseDefaultsOf('Default "Dismiss notification"; the title is appended: "Dismiss notification: `<title>`".')).toEqual(['"Dismiss notification"']);
    expect(proseDefaultsOf('Default `Choose date`, then `x` when a date is selected.')).toEqual(['`Choose date`']);
    expect(proseDefaultsOf('Default 3, `x`.')).toEqual(['3', '`x`']);
    expect(proseDefaultsOf('Default `a`, 4 and more.')).toEqual(['`a`']);
  });

  it('is `[]` without a default, and skips a default of a named key as `proseDefaultOf` does', () => {
    expect(proseDefaultsOf('Name of the button.')).toEqual([]);
    expect(proseDefaultsOf('- `anchorBar`: the name of the nav (default "Sections").\nDefault `x`, `y`.')).toEqual(['`x`', '`y`']);
  });

  it('its first value is the one `proseDefaultOf` reads, on the samples and on every label key of the repository', () => {
    const samples = [
      'Default `Information`, `Success`.',
      'Default: "1 result", "10,000 results".',
      'Name. Default `Save`.',
      '`automatic` (default): the layout.',
      'The default is `md`, or `lg`.',
    ];
    for (const s of samples) expect(proseDefaultsOf(s)[0]).toBe(proseDefaultOf(s));
    const rows = measureLabels();
    expect(rows.length).toBeGreaterThan(50);
    for (const r of rows) {
      expect(r.proseValues[0], `${r.iface}.${r.key}`).toBe(r.prose);
    }
  }, 60_000);
});
