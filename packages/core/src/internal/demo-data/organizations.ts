// Company names of the demo universe (customers and suppliers): a coined, place-like root from a
// language area, an English trade word and the legal form of the country, e.g. "Grünfeld Bearings
// GmbH". The roots are invented on purpose and checked against a denylist of well-known sample brands;
// the surnames of the legacy invoice fixture are never used as company names (both enforced by tests).
import { AREA_COUNTRIES, type DemoCountryCode, type DemoLanguageArea } from './geo';
import { createPermutation, type Rng } from './rng';
import { toAsciiSlug } from './text';

/** Company-name roots by language area; their counts set how often each area appears. */
export const COMPANY_ROOTS: Readonly<Record<DemoLanguageArea, readonly string[]>> = {
  en: ['Brightwater', 'Ashford', 'Kingsbridge', 'Redmoor', 'Hollowell', 'Fairlight', 'Stonebrook', 'Marlow', 'Thornbury', 'Westcliff', 'Oakhurst', 'Whitcombe', 'Elmstead', 'Calder', 'Penrose', 'Larkfield'],
  de: ['Grünfeld', 'Altmühl', 'Brennwald', 'Falkenau', 'Lindenhof', 'Steinbach', 'Weißach', 'Rabenstein', 'Eichwerk', 'Hohenfels', 'Mühlberg', 'Talheim', 'Schönau', 'Feldkamp'],
  nl: ['Zuiderhaven', 'Kortenaer', 'Lindeboom', 'Waalkant', 'Hoogland', 'Meerburg', 'Vlietland', 'Eikelaar'],
  fr: ['Clairval', 'Montrésor', 'Valbonne', 'Beaulieu', 'Hautecour', 'Chênevert', 'Roncelles', 'Belcastel'],
  es: ['Montesol', 'Valdeluz', 'Peñalara', 'Castellar', 'Riosur', 'Torralba'],
  it: ['Montecalvo', 'Belfiore', 'Rivalta', 'Pianalto', 'Torrebruna', 'Colleverde'],
  nordic: ['Nordvik', 'Østby', 'Fjellstad', 'Ålund', 'Strandvik', 'Bergholm', 'Søndervang', 'Kvarnström'],
  pl: ['Wierzbno', 'Zielonka', 'Brzozów', 'Łąkowo', 'Sosnowa'],
  ja: ['Kawasemi', 'Shiranami', 'Yamabuki', 'Takigawa', 'Sakuragi', 'Kazeoka'],
};

/** Legal forms by country (English renderings where the local one is not used abroad). */
const LEGAL_FORMS: Readonly<Record<DemoCountryCode, readonly string[]>> = {
  NL: ['B.V.'],
  BE: ['NV', 'BV'],
  DE: ['GmbH', 'GmbH', 'AG'],
  AT: ['GmbH'],
  CH: ['AG'],
  FR: ['SAS', 'S.A.'],
  ES: ['S.L.', 'S.A.'],
  IT: ['S.r.l.', 'S.p.A.'],
  IE: ['Ltd'],
  GB: ['Ltd', 'Ltd', 'plc'],
  SE: ['AB'],
  DK: ['A/S'],
  NO: ['AS'],
  PL: ['Sp. z o.o.'],
  US: ['Inc.', 'LLC', 'Corp.'],
  JP: ['Co., Ltd.'],
};

const AREAS = Object.keys(COMPANY_ROOTS) as DemoLanguageArea[];

/** A generated company identity. */
export interface CompanyName<Sector> {
  readonly name: string;
  readonly area: DemoLanguageArea;
  readonly country: DemoCountryCode;
  readonly sector: Sector;
  /** `<root>-<trade>.example` host name (RFC 2606 reserved top-level domain). */
  readonly domain: string;
  /** `https://www.<domain>`. */
  readonly website: string;
}

/**
 * A company-name space over `sectors` (each with the trade word used in the name). The slot of row
 * `i` comes from a pseudo-random bijection, so the first {@link CompanyNameSpace.size} rows of a
 * dataset all have different root + trade combinations (hence different names and domains); later rows
 * cycle through the same names again, as a large real register would hold namesakes.
 */
export interface CompanyNameSpace<Sector> {
  readonly size: number;
  name(index: number, rng: Rng): CompanyName<Sector>;
}

export function createCompanyNameSpace<Sector>(
  seed: string,
  sectors: readonly (readonly [trade: string, sector: Sector])[],
): CompanyNameSpace<Sector> {
  const tradeSlugs = sectors.map(([trade]) => toAsciiSlug(trade, '-'));
  const rootSlugs = Object.fromEntries(AREAS.map((area) => [area, COMPANY_ROOTS[area].map((root) => toAsciiSlug(root, '-'))]));
  // Cumulative slot offsets: area `a` owns roots(a) x sectors consecutive slots.
  const offsets: number[] = [];
  let size = 0;
  for (const area of AREAS) {
    offsets.push(size);
    size += COMPANY_ROOTS[area].length * sectors.length;
  }
  const permute = createPermutation(size, seed);
  // The strings of a slot are built once and shared by every row (and later cycle) that uses it.
  const bases: { area: DemoLanguageArea; sector: Sector; stem: string; domain: string; website: string }[] = [];
  return {
    size,
    name(index, rng) {
      const slot = permute(index);
      let base = bases[slot];
      if (!base) {
        let a = AREAS.length - 1;
        while (offsets[a]! > slot) a--;
        const area = AREAS[a]!;
        const local = slot - offsets[a]!;
        const rootIndex = Math.floor(local / sectors.length);
        const sectorIndex = local % sectors.length;
        const [trade, sector] = sectors[sectorIndex]!;
        const domain = `${rootSlugs[area]![rootIndex]}-${tradeSlugs[sectorIndex]}.example`;
        base = { area, sector, stem: `${COMPANY_ROOTS[area][rootIndex]} ${trade}`, domain, website: `https://www.${domain}` };
        bases[slot] = base;
      }
      const country = rng.weighted(AREA_COUNTRIES[base.area]);
      return {
        name: `${base.stem} ${rng.pick(LEGAL_FORMS[country])}`,
        area: base.area,
        country,
        sector: base.sector,
        domain: base.domain,
        website: base.website,
      };
    },
  };
}
