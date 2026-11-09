import { describe, expect, it } from 'vitest';
import { formatFileSize, resolveSelection } from './selection';

const file = (name: string, size = 10, type = 'application/pdf', lastModified = 1) =>
  new File([new Uint8Array(size)], name, { type, lastModified });

const names = (files: File[]) => files.map((f) => f.name);

describe('resolveSelection', () => {
  it('adds valid files and reports the rejected ones with the right reason', () => {
    const pdf = file('a.pdf');
    const exe = file('b.exe', 10, 'application/x-msdownload');
    const big = file('c.pdf', 500);
    const result = resolveSelection([], [pdf, exe, big], { multiple: true, accept: '.pdf', maxSize: 100 });
    expect(names(result.next)).toEqual(['a.pdf']);
    expect(result.rejections).toEqual([
      { file: exe, reason: 'type' },
      { file: big, reason: 'size' },
    ]);
    expect(result.changed).toBe(true);
  });

  it('a size equal to maxSize is accepted; a 0-byte file is accepted', () => {
    const result = resolveSelection([], [file('a.pdf', 100), file('empty.pdf', 0)], { multiple: true, maxSize: 100 });
    expect(names(result.next)).toEqual(['a.pdf', 'empty.pdf']);
    expect(result.rejections).toEqual([]);
  });

  it('only rejected files: nothing changes', () => {
    const current = [file('a.pdf')];
    const result = resolveSelection(current, [file('b.exe', 10, 'x/y')], { multiple: true, accept: '.pdf' });
    expect(result.changed).toBe(false);
    expect(result.next).toEqual(current);
    expect(result.rejections).toHaveLength(1);
  });

  it('multiple appends to the current files, in order, without duplicates (name + size + lastModified)', () => {
    const a = file('a.pdf');
    const sameAgain = file('a.pdf');
    const sameNameOtherSize = file('a.pdf', 20);
    const sameNameOtherDate = file('a.pdf', 10, 'application/pdf', 2);
    const result = resolveSelection([a], [sameAgain, sameNameOtherSize, sameNameOtherDate, file('b.pdf')], { multiple: true });
    expect(result.next).toHaveLength(4);
    expect(result.next[0]).toBe(a);
    expect(result.rejections).toEqual([]);
    const onlyDuplicate = resolveSelection([a], [sameAgain], { multiple: true });
    expect(onlyDuplicate.changed).toBe(false);
  });

  it('two identical files in the same gesture are added once', () => {
    expect(resolveSelection([], [file('a.pdf'), file('a.pdf')], { multiple: true }).next).toHaveLength(1);
  });

  it('maxFiles counts the current files; the excess is rejected as count, in order', () => {
    const [a, b, c] = [file('a.pdf'), file('b.pdf'), file('c.pdf')];
    const result = resolveSelection([file('x.pdf')], [a, b, c], { multiple: true, maxFiles: 3 });
    expect(names(result.next)).toEqual(['x.pdf', 'a.pdf', 'b.pdf']);
    expect(result.rejections).toEqual([{ file: c, reason: 'count' }]);
  });

  it('with the limit already reached everything new is rejected as count', () => {
    const result = resolveSelection([file('x.pdf')], [file('a.pdf')], { multiple: true, maxFiles: 1 });
    expect(result.changed).toBe(false);
    expect(result.rejections.map((r) => r.reason)).toEqual(['count']);
  });

  it('an invalid file does not use up a maxFiles slot', () => {
    const result = resolveSelection([], [file('bad.exe', 10, 'x/y'), file('a.pdf'), file('b.pdf')], {
      multiple: true,
      accept: '.pdf',
      maxFiles: 2,
    });
    expect(names(result.next)).toEqual(['a.pdf', 'b.pdf']);
    expect(result.rejections.map((r) => r.reason)).toEqual(['type']);
  });

  it('without multiple the first valid file replaces the current one, the others are rejected as count', () => {
    const [bad, first, second] = [file('bad.exe', 10, 'x/y'), file('a.pdf'), file('b.pdf')];
    const result = resolveSelection([file('old.pdf')], [bad, first, second], { multiple: false, accept: '.pdf' });
    expect(result.next).toEqual([first]);
    expect(result.rejections).toEqual([
      { file: bad, reason: 'type' },
      { file: second, reason: 'count' },
    ]);
  });

  it('without multiple, only rejected files keep the current file', () => {
    const current = [file('old.pdf')];
    const result = resolveSelection(current, [file('b.exe', 10, 'x/y')], { multiple: false, accept: '.pdf' });
    expect(result.next).toEqual(current);
    expect(result.changed).toBe(false);
  });

  it('without multiple, picking the same file again is not a change', () => {
    expect(resolveSelection([file('a.pdf')], [file('a.pdf')], { multiple: false }).changed).toBe(false);
  });
});

describe('formatFileSize', () => {
  it('uses kilobytes below 1 MB and megabytes from 1 MB', () => {
    expect(formatFileSize(0, 'en')).toBe('0 kB');
    expect(formatFileSize(1500, 'en')).toBe('1.5 kB');
    expect(formatFileSize(999_999, 'en')).toBe('1 MB');
    expect(formatFileSize(1_000_000, 'en')).toBe('1 MB');
    expect(formatFileSize(2_340_000, 'en')).toBe('2.3 MB');
  });

  it('chooses the unit after rounding: never "1,000 kB" at the boundary', () => {
    expect(formatFileSize(999_949, 'en')).toBe('999.9 kB');
    expect(formatFileSize(999_950, 'en')).toBe('1 MB');
    expect(formatFileSize(999_951, 'en')).toBe('1 MB');
  });

  it('formats in the given locale', () => {
    expect(formatFileSize(1500, 'de')).toBe('1,5 kB');
  });
});
