import { describe, expect, it } from 'vitest';
import {
  canonicalString,
  clamp,
  createNumberLocale,
  decimalPlaces,
  normalizeLimit,
  normalizeStep,
  normalizeValue,
  parseNumber,
  roundTo,
  stepFrom,
} from './number-parse';

const it_IT = createNumberLocale('it-IT');
const en_US = createNumberLocale('en-US');
const de_DE = createNumberLocale('de-DE');

describe('createNumberLocale', () => {
  it('reads the decimal separator of the locale', () => {
    expect(it_IT.decimal).toBe(',');
    expect(de_DE.decimal).toBe(',');
    expect(en_US.decimal).toBe('.');
  });

  it('formats without grouping and without losing decimals', () => {
    expect(it_IT.format(1234567.891)).toBe('1234567,891');
    expect(en_US.format(1234567.891)).toBe('1234567.891');
    expect(it_IT.format(12.5)).toBe('12,5');
    expect(en_US.format(0.1 + 0.2)).toBe('0.30000000000000004');
    expect(it_IT.format(-3)).toBe('-3');
  });

  it('round-trips what it formats', () => {
    for (const loc of [it_IT, en_US, de_DE, createNumberLocale('ar-EG'), createNumberLocale('sv-SE')]) {
      for (const n of [0, 1, -1, 12.5, -0.001, 19.99, 1234567.25, 0.1 + 0.2]) {
        expect(loc.parse(loc.format(n)), `${loc.format(n)}`).toEqual({ kind: 'number', value: n });
      }
    }
  });

  it('runtime default (undefined) works', () => {
    const loc = createNumberLocale(undefined);
    expect(loc.parse(loc.format(2.5))).toEqual({ kind: 'number', value: 2.5 });
  });
});

describe('parseNumber (it-IT)', () => {
  it.each([
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['12', 12],
    ['  7 ', 7],
    ['-5', -5],
    [`${String.fromCharCode(0x2212)}5`, -5],
    [`${String.fromCharCode(0x2013)}5`, -5],
    [`${String.fromCharCode(0xa0)}8${String.fromCharCode(0x202f)}`, 8],
    ['0,30', 0.3],
    [',5', 0.5],
    ['5,', 5],
    ['-0', 0],
    ['007', 7],
  ])('%j → %d', (text, value) => {
    expect(it_IT.parse(text)).toEqual({ kind: 'number', value });
  });

  it.each(['', '   ', String.fromCharCode(0xa0)])('%j is empty', (text) => {
    expect(it_IT.parse(text)).toEqual({ kind: 'empty' });
  });

  it.each(['abc', '-', '+5', '1e3', '1.234,56', '1,2,3', '1..2', '12a', '5-', '--5', ',', '1 000', 'Infinity', 'NaN', '0x10'])(
    '%j is invalid',
    (text) => {
      expect(it_IT.parse(text)).toEqual({ kind: 'invalid' });
    },
  );

  it('-0 is reported as +0', () => {
    const r = it_IT.parse('-0');
    expect(r.kind === 'number' && Object.is(r.value, 0)).toBe(true);
  });
});

describe('parseNumber (en-US)', () => {
  it('reads `.` as the decimal separator', () => {
    expect(en_US.parse('12.5')).toEqual({ kind: 'number', value: 12.5 });
  });

  it('a comma is not a decimal separator there (it would be grouping): invalid', () => {
    expect(en_US.parse('1,234')).toEqual({ kind: 'invalid' });
    expect(en_US.parse('12,5')).toEqual({ kind: 'invalid' });
  });
});

describe('parseNumber with locale digits', () => {
  it('maps Arabic-Indic digits (ar-EG) and keeps accepting ASCII ones', () => {
    const ar = createNumberLocale('ar-EG');
    expect(ar.parse(ar.format(42))).toEqual({ kind: 'number', value: 42 });
    expect(ar.parse('42')).toEqual({ kind: 'number', value: 42 });
  });

  it('a custom digit map', () => {
    expect(parseNumber('١٢', '.', new Map([['١', '1'], ['٢', '2']]))).toEqual({ kind: 'number', value: 12 });
  });
});

describe('decimalPlaces', () => {
  it.each([
    [0, 0],
    [1, 0],
    [0.1, 1],
    [19.99, 2],
    [-0.005, 3],
    [1e-7, 7],
    [1.5e-7, 8],
    [1e21, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])('%d → %d', (n, places) => {
    expect(decimalPlaces(n)).toBe(places);
  });
});

describe('roundTo', () => {
  it('removes floating-point noise', () => {
    expect(roundTo(0.1 + 0.2, 1)).toBe(0.3);
    expect(roundTo(19.99 + 0.01, 2)).toBe(20);
    expect(roundTo(1.005, 2)).toBe(1); // 1.005 is 1.00499999... in binary
    expect(roundTo(5, 0)).toBe(5);
  });
});

describe('clamp', () => {
  it.each([
    [150, 0, 100, 100],
    [-5, 0, 100, 0],
    [50, 0, 100, 50],
    [50, undefined, 10, 10],
    [-50, -10, undefined, -10],
    [7, undefined, undefined, 7],
    // min > max: min wins.
    [7, 10, 5, 10],
    [3, 10, 5, 10],
  ])('clamp(%d, %s, %s) = %d', (v, min, max, expected) => {
    expect(clamp(v, min, max)).toBe(expected);
  });
});

describe('stepFrom (precision matrix)', () => {
  it.each([
    // from, step, direction, multiplier, min, max, expected
    [0.2, 0.1, 1, 1, undefined, undefined, 0.3],
    [0.3, 0.1, -1, 1, undefined, undefined, 0.2],
    [0.1, 0.2, 1, 1, undefined, undefined, 0.3],
    [19.99, 0.01, 1, 1, undefined, undefined, 20],
    [1.1, 0.1, 1, 10, undefined, undefined, 2.1],
    [0.7, 0.1, -1, 10, undefined, undefined, -0.3],
    [12.37, 0.5, 1, 1, undefined, undefined, 12.87],
    [12.37, 1, 1, 1, undefined, undefined, 13.37],
    [5, 1, 1, 1, 0, 5, 5],
    [0, 1, -1, 1, 0, 5, 0],
    [150, 1, 1, 1, 0, 100, 100],
    [150, 1, -1, 1, 0, 100, 100],
    [95, 1, 1, 10, 0, 100, 100],
    [-0.1, 0.1, 1, 1, undefined, undefined, 0],
    [1e-7, 1e-7, 1, 1, undefined, undefined, 2e-7],
    [3, 0.25, 1, 1, undefined, undefined, 3.25],
  ] as const)('stepFrom(%d, %d, %d, ×%d, [%s, %s]) = %d', (from, step, direction, multiplier, min, max, expected) => {
    expect(stepFrom(from, step, direction, multiplier, min, max)).toBe(expected);
  });

  it('a run of 100 steps of 0.1 lands exactly on 10', () => {
    let v = 0;
    for (let i = 0; i < 100; i++) v = stepFrom(v, 0.1, 1, 1, undefined, undefined);
    expect(v).toBe(10);
  });
});

describe('normalizers', () => {
  it('normalizeStep: finite and > 0, else 1', () => {
    expect(normalizeStep(undefined)).toBe(1);
    expect(normalizeStep(0.5)).toBe(0.5);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(normalizeStep(bad)).toBe(1);
  });

  it('normalizeLimit: finite, else no limit', () => {
    expect(normalizeLimit(0)).toBe(0);
    expect(normalizeLimit(-3)).toBe(-3);
    for (const bad of [undefined, null, Number.NaN, Number.NEGATIVE_INFINITY]) expect(normalizeLimit(bad)).toBeUndefined();
  });

  it('normalizeValue: finite numbers only', () => {
    expect(normalizeValue(0)).toBe(0);
    expect(normalizeValue(1.5)).toBe(1.5);
    for (const bad of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, '5', {}]) expect(normalizeValue(bad)).toBeUndefined();
  });

  it('canonicalString: the JS form, empty for undefined', () => {
    expect(canonicalString(12.5)).toBe('12.5');
    expect(canonicalString(-3)).toBe('-3');
    expect(canonicalString(undefined)).toBe('');
  });
});
