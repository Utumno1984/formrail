import { computeAutoHeight, readLineHeight } from './auto-height';

const BASE = { lineHeight: 20, paddingY: 14, borderY: 2, boxSizing: 'content-box', rows: 3 } as const;

describe('computeAutoHeight', () => {
  it('never goes below `rows` lines', () => {
    // One line of text: scrollHeight is 3 rows anyway with height:auto, but a smaller one must still clamp up.
    expect(computeAutoHeight({ ...BASE, scrollHeight: 20 + 14 })).toEqual({ height: 60, clamped: false });
  });

  it('follows the content between rows and maxRows (content-box: content height only)', () => {
    expect(computeAutoHeight({ ...BASE, scrollHeight: 5 * 20 + 14, maxRows: 8 })).toEqual({ height: 100, clamped: false });
  });

  it('border-box adds padding and border', () => {
    expect(computeAutoHeight({ ...BASE, boxSizing: 'border-box', scrollHeight: 5 * 20 + 14 })).toEqual({
      height: 100 + 14 + 2,
      clamped: false,
    });
  });

  it('stops at maxRows and reports the clamp', () => {
    expect(computeAutoHeight({ ...BASE, scrollHeight: 9 * 20 + 14, maxRows: 4 })).toEqual({ height: 80, clamped: true });
  });

  it('content exactly at maxRows is not clamped (no phantom scrollbar)', () => {
    expect(computeAutoHeight({ ...BASE, scrollHeight: 4 * 20 + 14, maxRows: 4 })).toEqual({ height: 80, clamped: false });
  });

  // `scrollHeight` is an integer, line heights may not be (measured in Chromium: 19.5px × 7 rows gives
  // scrollHeight 151, i.e. content 137 against a limit of 136.5). The tolerance keeps a phantom scrollbar away.
  it('fractional line height, content exactly at maxRows: not clamped despite the integer scrollHeight', () => {
    expect(computeAutoHeight({ ...BASE, lineHeight: 19.5, maxRows: 7, scrollHeight: 151 })).toEqual({ height: 136.5, clamped: false });
  });

  it('fractional line height, one row over maxRows: clamped', () => {
    expect(computeAutoHeight({ ...BASE, lineHeight: 19.5, maxRows: 7, scrollHeight: 170 })).toEqual({ height: 136.5, clamped: true });
  });

  it('content one pixel over the limit is clamped (the tolerance is sub-pixel, not a row fraction)', () => {
    expect(computeAutoHeight({ ...BASE, maxRows: 4, scrollHeight: 4 * 20 + 14 + 1 }).clamped).toBe(true);
  });

  it('content exactly at the limit plus the tolerance is still not clamped (strict comparison)', () => {
    // lineHeight 19.875 × 4 = 79.5; content 94 - 14 = 80 = 79.5 + 0.5.
    expect(computeAutoHeight({ ...BASE, lineHeight: 19.875, maxRows: 4, scrollHeight: 94 }).clamped).toBe(false);
  });

  it('maxRows below rows: rows wins', () => {
    expect(computeAutoHeight({ ...BASE, scrollHeight: 9 * 20 + 14, maxRows: 1 })).toEqual({ height: 60, clamped: true });
  });
});

describe('readLineHeight', () => {
  it('reads a pixel line height', () => {
    expect(readLineHeight({ lineHeight: '20px', fontSize: '14px' } as CSSStyleDeclaration)).toBe(20);
  });

  it('falls back to 1.2 × font size for `normal`', () => {
    expect(readLineHeight({ lineHeight: 'normal', fontSize: '10px' } as CSSStyleDeclaration)).toBeCloseTo(12);
  });

  it('no usable font size either: 1.2 × 16px', () => {
    expect(readLineHeight({ lineHeight: 'normal', fontSize: '' } as CSSStyleDeclaration)).toBeCloseTo(19.2);
  });
});
