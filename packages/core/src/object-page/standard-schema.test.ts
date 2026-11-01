import { describe, expect, it } from 'vitest';
import { issuesToErrors } from './standard-schema';

describe('issuesToErrors', () => {
  it('no issues: no errors', () => {
    expect(issuesToErrors([])).toEqual({ fieldErrors: {}, formErrors: [] });
  });

  it('joins string keys with dots', () => {
    expect(issuesToErrors([{ message: 'Required', path: ['address', 'city'] }]).fieldErrors).toEqual({
      'address.city': 'Required',
    });
  });

  it('keeps numeric indices as plain numbers in the path', () => {
    expect(issuesToErrors([{ message: 'Too low', path: ['lines', 0, 'qty'] }]).fieldErrors).toEqual({
      'lines.0.qty': 'Too low',
    });
  });

  it('unwraps { key } segments, mixed with plain keys', () => {
    expect(
      issuesToErrors([{ message: 'Bad', path: [{ key: 'lines' }, { key: 1 }, 'qty'] }]).fieldErrors,
    ).toEqual({ 'lines.1.qty': 'Bad' });
  });

  it('converts symbol segments with String()', () => {
    const sym = Symbol('meta');
    expect(issuesToErrors([{ message: 'Bad', path: [sym, { key: Symbol('x') }] }]).fieldErrors).toEqual({
      'Symbol(meta).Symbol(x)': 'Bad',
    });
  });

  it('keeps only the first message for a path, in issue order', () => {
    const { fieldErrors } = issuesToErrors([
      { message: 'Too short', path: ['supplier'] },
      { message: 'Must start with a capital', path: ['supplier'] },
      { message: 'Required', path: ['amount'] },
      { message: 'Also bad', path: [{ key: 'supplier' }] },
    ]);
    expect(fieldErrors).toEqual({ supplier: 'Too short', amount: 'Required' });
    expect(Object.keys(fieldErrors)).toEqual(['supplier', 'amount']);
  });

  it('an absent or empty path is a root (form) error, never a field error; all of them, in order', () => {
    expect(
      issuesToErrors([
        { message: 'Dates out of order' },
        { message: 'Required', path: ['supplier'] },
        { message: 'Total mismatch', path: [] },
        { message: 'Explicit undefined', path: undefined },
      ]),
    ).toEqual({
      fieldErrors: { supplier: 'Required' },
      formErrors: ['Dates out of order', 'Total mismatch', 'Explicit undefined'],
    });
  });

  it('a __proto__ segment stays an own key and never changes the prototype', () => {
    const { fieldErrors } = issuesToErrors([{ message: 'Bad', path: ['__proto__'] }]);
    expect(Object.getPrototypeOf(fieldErrors)).toBe(Object.prototype);
    expect(Object.keys(fieldErrors)).toEqual(['__proto__']);
    expect(Object.getOwnPropertyDescriptor(fieldErrors, '__proto__')?.value).toBe('Bad');
  });
});
