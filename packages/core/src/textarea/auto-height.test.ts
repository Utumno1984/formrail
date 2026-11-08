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
});
