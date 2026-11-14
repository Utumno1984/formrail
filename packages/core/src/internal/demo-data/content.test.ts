// @vitest-environment node
// Content rules of the demo universe: no well-known sample brands, no legacy fixture surnames as
// company names, reserved `.example` domains only, international Latin-script names with accents.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_COMPANY } from './company';
import { makeCustomers } from './customers';
import { makeEmployees } from './employees';
import { COMPANY_ROOTS } from './organizations';
import { ALL_PERSON_NAMES } from './people';
import { makeProducts } from './products';
import { makeSuppliers } from './suppliers';

const DIR = dirname(fileURLToPath(import.meta.url));
const SOURCES = readdirSync(DIR)
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
  .map((name) => [name, readFileSync(join(DIR, name), 'utf8')] as const);

/** Well-known sample/fictional brands of vendor docs and pop culture: a demo must not look borrowed. */
const DENYLIST = [
  'Northwind',
  'Contoso',
  'Fabrikam',
  'Acme',
  'AdventureWorks',
  'Adventure Works',
  'Wide World Importers',
  'WideWorldImporters',
  'Tailspin',
  'Litware',
  'Proseware',
  'Woodgrove',
  'Wingtip',
  'Fourth Coffee',
  'Alpine Ski House',
  'Coho Winery',
  'Lucerne Publishing',
  'Trey Research',
  'Relecloud',
  'Initech',
  'Globex',
  'Umbrella Corp',
  'Cyberdyne',
  'Tyrell',
  'Wayne Enterprises',
  'Stark Industries',
  'Dunder Mifflin',
  'Vandelay',
  'Hooli',
  'Soylent',
  'Wonka',
];

/** Surnames of the legacy invoice fixture (`internal/demo-invoices.ts`): never a company name again. */
const LEGACY_SURNAMES = ['Rossi', 'Bianchi', 'Verdi', 'Neri', 'Gialli', 'Esposito', 'Ferrari', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco'];

const word = (text: string) => new RegExp(`(^|[^\\p{L}])${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu');

/** Every string value of a record, nested objects and arrays included. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') for (const child of Object.values(value)) strings(child, out);
  return out;
}

const N = 10_000;
const records = () => [...makeEmployees(N), ...makeCustomers(N), ...makeSuppliers(N), ...makeProducts(N)];
let allStrings: string[] | undefined;
/** Every string of the first N rows of every domain (computed once). */
const recordStrings = () => (allStrings ??= strings(records()));

describe('demo content', () => {
  it('names no well-known sample brand, in the sources or in the generated data', () => {
    const patterns = DENYLIST.map((brand) => [brand, new RegExp(brand.replace(/\s+/g, '\\s*'), 'i')] as const);
    const inSources = SOURCES.flatMap(([file, text]) => patterns.filter(([, re]) => re.test(text)).map(([brand]) => `${file}: ${brand}`));
    expect(inSources).toEqual([]);
    const all = [...strings(DEMO_COMPANY), ...recordStrings()].join('\n');
    expect(patterns.filter(([, re]) => re.test(all)).map(([brand]) => brand)).toEqual([]);
  });

  it('the denylist check does catch a sample brand', () => {
    expect(new RegExp('Wide World Importers'.replace(/\s+/g, '\\s*'), 'i').test('widewOrldimporters Ltd')).toBe(true);
    expect(word('Rossi').test('Rossi Construction Ltd')).toBe(true);
    expect(word('Neri').test('Nerima Works')).toBe(false);
  });

  it('never uses a legacy fixture surname in a company name, nor as a personal surname', () => {
    const companies = [...makeCustomers(N), ...makeSuppliers(N)].map((company) => company.name);
    const roots = Object.values(COMPANY_ROOTS).flat();
    for (const surname of LEGACY_SURNAMES) {
      const re = word(surname);
      expect(companies.filter((name) => re.test(name)), surname).toEqual([]);
      expect(roots.filter((root) => re.test(root)), surname).toEqual([]);
      expect(ALL_PERSON_NAMES.filter((name) => re.test(name)), surname).toEqual([]);
    }
  });

  it('uses only reserved .example domains for every e-mail address and web site', () => {
    const urls: string[] = [DEMO_COMPANY.website];
    const emails: string[] = [];
    for (const value of recordStrings()) {
      if (value.includes('@')) emails.push(value);
      if (/^https?:/.test(value)) urls.push(value);
    }
    expect(emails.length).toBeGreaterThan(N);
    expect(urls.length).toBeGreaterThan(N);
    expect(emails.filter((email) => !/^[a-z0-9.]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.example$/.test(email))).toEqual([]);
    expect(urls.filter((url) => !/^https:\/\/www\.[a-z0-9-]+\.example$/.test(url))).toEqual([]);
    // No other host name slips in through free text either.
    expect(recordStrings().filter((value) => /\.(com|net|org|io|de|nl|co\.uk|jp)\b/i.test(value) && !value.includes('.example'))).toEqual([]);
  });

  it('is international: names from several language areas, with accents, ß and ø, in Latin script only', () => {
    const people = makeEmployees(2000).map((employee) => employee.fullName);
    const companies = makeCustomers(2000).map((customer) => customer.name);
    const cities = makeCustomers(2000).map((customer) => customer.billingAddress.city);
    const text = [...people, ...companies, ...cities].join(' ');
    expect(text).toMatch(/ß/);
    expect(text).toMatch(/ø/);
    expect(text).toMatch(/[éèêáíóúñ]/);
    expect(text).toMatch(/[äöü]/);
    expect(text).toMatch(/[łąśźż]/);
    // Every letter is a Latin one (no right-to-left nor CJK script until RTL is guaranteed).
    expect(recordStrings().filter((value) => /(?!\p{Script=Latin})\p{L}/u.test(value))).toEqual([]);
    expect(/(?!\p{Script=Latin})\p{L}/u.test('Osaka 大阪')).toBe(true);
    // Several countries among the first customers.
    expect(new Set(makeCustomers(200).map((customer) => customer.country)).size).toBeGreaterThanOrEqual(10);
  });
});
