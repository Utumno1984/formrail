// @vitest-environment node
// Static checks on the source files of the demo universe: determinism and the single place of the
// company name.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_COMPANY } from './company';

const DIR = dirname(fileURLToPath(import.meta.url));
const ALL_FILES = readdirSync(DIR).filter((name) => /\.tsx?$/.test(name));
const SOURCE_FILES = ALL_FILES.filter((name) => !/\.test\.tsx?$/.test(name));
const read = (name: string) => readFileSync(join(DIR, name), 'utf8');

describe('demo-data sources', () => {
  it('has the expected modules', () => {
    for (const file of ['index.ts', 'rng.ts', 'format.ts', 'company.ts', 'employees.ts', 'customers.ts', 'suppliers.ts', 'products.ts']) {
      expect(SOURCE_FILES).toContain(file);
    }
  });

  it('never reads the clock nor an unseeded random source', () => {
    const forbidden = [/Math\.random\s*\(/, /Date\.now\s*\(/, /new Date\s*\(\s*\)/, /performance\.now\s*\(/, /crypto\.(getRandomValues|randomUUID)/];
    const offenders = SOURCE_FILES.flatMap((file) =>
      forbidden.filter((pattern) => pattern.test(read(file))).map((pattern) => `${file}: ${pattern.source}`),
    );
    expect(offenders).toEqual([]);
  });

  it('the scan above does catch each forbidden call', () => {
    // Guards the regular expressions themselves (a typo would make the scan pass vacuously).
    const samples = ['Math.random()', 'Date.now()', 'new Date()', 'new Date( )', 'performance.now()', 'crypto.randomUUID()'];
    const forbidden = [/Math\.random\s*\(/, /Date\.now\s*\(/, /new Date\s*\(\s*\)/, /performance\.now\s*\(/, /crypto\.(getRandomValues|randomUUID)/];
    for (const sample of samples) expect(forbidden.some((pattern) => pattern.test(sample))).toBe(true);
    expect(forbidden.some((pattern) => pattern.test('new Date(Date.UTC(2026, 2, 29))'))).toBe(false);
  });

  it('writes the company name in company.ts only, exactly once', () => {
    // The distinctive first word, case-insensitive, also catches derived spellings (domain names).
    const word = new RegExp(DEMO_COMPANY.name.split(' ')[0]!, 'gi');
    expect(word.source.length).toBeGreaterThan(3);
    const counts = Object.fromEntries(ALL_FILES.map((file) => [file, read(file).match(word)?.length ?? 0]));
    expect(counts['company.ts']).toBe(1);
    expect(Object.entries(counts).filter(([file, count]) => file !== 'company.ts' && count > 0)).toEqual([]);
  });
});
