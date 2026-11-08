import { describe, expect, it } from 'vitest';
import { matchesAccept, parseAccept } from './accept';

const f = (name: string, type = '') => ({ name, type });

describe('parseAccept', () => {
  it('trims, lowercases and drops blanks and invalid tokens', () => {
    expect(parseAccept(' .PDF , image/* ,, application/pdf ')).toEqual(['.pdf', 'image/*', 'application/pdf']);
    expect(parseAccept('pdf, ., foo/')).toEqual([]);
    expect(parseAccept(undefined)).toEqual([]);
    expect(parseAccept('   ')).toEqual([]);
  });
});

describe('matchesAccept', () => {
  it('accepts everything without a (valid) filter', () => {
    expect(matchesAccept(f('a.exe'), undefined)).toBe(true);
    expect(matchesAccept(f('a.exe'), '')).toBe(true);
    expect(matchesAccept(f('a.exe'), '   ')).toBe(true);
    expect(matchesAccept(f('a.exe'), 'garbage')).toBe(true);
  });

  it('matches extensions case-insensitively, at the end of the name only', () => {
    expect(matchesAccept(f('Invoice.PDF'), '.pdf')).toBe(true);
    expect(matchesAccept(f('invoice.pdf'), '.PDF')).toBe(true);
    expect(matchesAccept(f('invoice.pdf.exe'), '.pdf')).toBe(false);
    expect(matchesAccept(f('invoice.txt'), '.pdf')).toBe(false);
  });

  it('matches an exact MIME type', () => {
    expect(matchesAccept(f('a', 'application/pdf'), 'application/pdf')).toBe(true);
    expect(matchesAccept(f('a', 'Application/PDF'), 'application/pdf')).toBe(true);
    expect(matchesAccept(f('a', 'application/pdf; foo=bar'), 'application/pdf')).toBe(true);
    expect(matchesAccept(f('a', 'application/zip'), 'application/pdf')).toBe(false);
  });

  it('matches a wildcard family, not a lookalike prefix', () => {
    expect(matchesAccept(f('a', 'image/png'), 'image/*')).toBe(true);
    expect(matchesAccept(f('a', 'image/svg+xml'), 'image/*')).toBe(true);
    expect(matchesAccept(f('a', 'video/mp4'), 'image/*')).toBe(false);
    expect(matchesAccept(f('a', 'imagex/png'), 'image/*')).toBe(false);
  });

  it('a file with an empty MIME type matches only by extension', () => {
    expect(matchesAccept(f('a.pdf', ''), 'application/pdf')).toBe(false);
    expect(matchesAccept(f('a.pdf', ''), 'image/*')).toBe(false);
    expect(matchesAccept(f('a.pdf', ''), 'image/*,.pdf')).toBe(true);
  });

  it('is an OR across tokens', () => {
    const accept = '.pdf,image/*';
    expect(matchesAccept(f('a.pdf', 'application/pdf'), accept)).toBe(true);
    expect(matchesAccept(f('a.png', 'image/png'), accept)).toBe(true);
    expect(matchesAccept(f('a.exe', 'application/x-msdownload'), accept)).toBe(false);
  });
});
