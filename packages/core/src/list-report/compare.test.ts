import { describe, expect, it } from 'vitest';
import { createCollator } from './compare';

describe('createCollator', () => {
  // Regression (#500): `new Intl.Collator('en_US')` throws a RangeError, and `useListReport({ locale })` called it
  // straight from the render. An invalid tag now degrades to the runtime default, like `resolveLocale` of the calendar.
  it.each([['en_US'], [''], [['!!']], [[]], [['!!', 'x_y']]])('invalid locale %j: no exception, the runtime default collation', (locale) => {
    expect(() => createCollator(locale as string | string[])).not.toThrow();
    expect(createCollator(locale as string | string[]).compare('a2', 'a10')).toBeLessThan(0); // numeric: true
  });

  it('a valid locale or array still drives the collation', () => {
    expect(createCollator('sv').compare('z', 'ä')).toBeLessThan(0);
    expect(createCollator('de').compare('ä', 'z')).toBeLessThan(0);
    expect(createCollator(['!!', 'sv']).compare('z', 'ä')).toBeLessThan(0);
  });
});
