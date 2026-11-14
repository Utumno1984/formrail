// @vitest-environment node
import { createRng } from './rng';
import { AREA_COUNTRIES, DEMO_COUNTRIES, makeAddress, makePhone, POSTAL_CODE_PATTERN, type DemoCountryCode } from './geo';

const CODES = Object.keys(DEMO_COUNTRIES) as DemoCountryCode[];

describe('demo geography', () => {
  it('city names are unique across countries (the phone-area lookup is keyed by city)', () => {
    const names = CODES.flatMap((code) => DEMO_COUNTRIES[code].cities.map((city) => city.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it('every country is reachable from a language area', () => {
    const reachable = new Set(Object.values(AREA_COUNTRIES).flatMap((entries) => entries.map(([code]) => code)));
    expect(reachable).toEqual(new Set(CODES));
  });

  it('generates postal codes in each country format, and phone numbers with the country calling code', () => {
    const rng = createRng('geo');
    const problems: string[] = [];
    for (const code of CODES) {
      for (let i = 0; i < 300; i++) {
        const address = makeAddress(rng, DEMO_COUNTRIES[code]);
        if (!POSTAL_CODE_PATTERN[code].test(address.postalCode)) problems.push(`${code}: ${address.postalCode}`);
        const phone = makePhone(rng, address);
        if (!phone.startsWith(`+${DEMO_COUNTRIES[code].callingCode} `)) problems.push(`${code}: ${phone}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('uses the ranges reserved for fiction where they exist (NANP 555-01xx, Ofcom 496 0xxx)', () => {
    const rng = createRng('phones');
    for (let i = 0; i < 100; i++) {
      expect(makePhone(rng, makeAddress(rng, DEMO_COUNTRIES.US))).toMatch(/^\+1 \d{3}-555-01\d{2}$/);
      expect(makePhone(rng, makeAddress(rng, DEMO_COUNTRIES.GB))).toMatch(/^\+44 \d{3} 496 0\d{3}$/);
    }
  });
});
