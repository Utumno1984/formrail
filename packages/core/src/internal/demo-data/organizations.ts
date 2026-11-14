// Company names of the demo universe (customers and suppliers): a coined root from a language area,
// an English trade word and the legal form of the country, e.g. "Dornelfeld Bearings GmbH".
//
// How the roots were chosen (QA of PR #536): real place names make plausible but REAL companies
// ("Marlow Foods", "Oakhurst Dairy", "Lindeboom Brewing" all exist), so every root is coined: two
// morphemes typical of the language joined into a form that is not a dictionary word nor, as far as a
// manual check could tell, a town, river or brand. A coined word can still collide with something
// obscure, so `content.test.ts` keeps a denylist of the real roots and combinations found so far and
// checks the generated names against it; extend it when a new collision is reported.
// The surnames of the legacy invoice fixture are never used as company names (also enforced there).
import { AREA_COUNTRIES, DEMO_COUNTRIES, type DemoCountry, type DemoCountryCode, type DemoLanguageArea } from './geo';
import { createPermutation, type Rng } from './rng';
import { toAsciiSlug } from './text';

/** Coined company-name roots by language area; their counts set how often each area appears. */
export const COMPANY_ROOTS: Readonly<Record<DemoLanguageArea, readonly string[]>> = {
  en: ['Brennick', 'Callowfen', 'Dunmarrow', 'Elsworne', 'Farrowdyke', 'Glenquarry', 'Hathermoor', 'Kestrelby', 'Lowenbray', 'Merrowstone', 'Norrowcroft', 'Pellingstow', 'Quillenbrook', 'Rossenmarch', 'Tamberleigh', 'Wyndercombe'],
  de: ['Dornelfeld', 'Erlenschütt', 'Falkenzirn', 'Grünbrecht', 'Haselwende', 'Kieferstedt', 'Lärchenhub', 'Moorbrandt', 'Querlinghof', 'Rauhenstedt', 'Schwertling', 'Tannrüdel', 'Wolkenrieth', 'Zwerchfeld'],
  nl: ['Brakkevliet', 'Dorrenhaven', 'Eemsterbroek', 'Grevelkamp', 'Hoevenstrand', 'Kuilerdijk', 'Molentrecht', 'Veenderloo'],
  fr: ['Aubrevelle', 'Beaucrozat', 'Châtelvorne', 'Fontanérac', 'Marvesnil', 'Montclérac', 'Rouvellac', 'Valmérane'],
  es: ['Alcorvena', 'Benaguril', 'Castronela', 'Miravedra', 'Peñascura', 'Valdorrena'],
  it: ['Borgavella', 'Castelmirto', 'Montesandra', 'Pievarossa', 'Roccavelma', 'Valfiorita'],
  nordic: ['Bjørkenvik', 'Eskjøvang', 'Fjordeby', 'Gräsvalla', 'Holmskjær', 'Lindrøvik', 'Sjöbrandt', 'Tjärnskog'],
  pl: ['Brzozolin', 'Grabnowiecz', 'Jaworzyczek', 'Łąkomirz', 'Sosnorzew'],
  ja: ['Kazenagi', 'Mizuhoshi', 'Tokinoha', 'Yumesaka', 'Sorakane', 'Hikarimine'],
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

interface CountryChoice {
  readonly info: DemoCountry;
  readonly forms: readonly string[];
}

/** Per area: the weighted countries, each with its country record and legal forms (hot path: no keyed lookups). */
const AREA_CHOICES = new Map<DemoLanguageArea, readonly (readonly [CountryChoice, number])[]>(
  AREAS.map((area) => [area, AREA_COUNTRIES[area].map(([code, weight]) => [{ info: DEMO_COUNTRIES[code], forms: LEGAL_FORMS[code] }, weight] as const)]),
);

/** A generated company identity. */
export interface CompanyName<Sector> {
  readonly name: string;
  readonly area: DemoLanguageArea;
  readonly country: DemoCountryCode;
  /** The country record of `country` (saves a keyed lookup per row). */
  readonly countryInfo: DemoCountry;
  readonly sector: Sector;
  /** `<root>-<trade>.example` host name (RFC 2606 reserved top-level domain). */
  readonly domain: string;
  /** `https://www.<domain>`. */
  readonly website: string;
}

/**
 * A company-name space over `sectors` (each with the trade word used in the name). Row `i` is a pure
 * function of `i`: with `R` roots, the rows are taken in blocks of `R`; within a block every root
 * appears exactly once (in a pseudo-random order), and each block shifts the trade of every root by
 * one. So the first `R` rows (77) never repeat a root, and the first {@link CompanyNameSpace.size}
 * rows (`R` x trades) never repeat a root + trade combination (hence a name or a domain); later rows
 * cycle through the same names again, as a large real register would hold namesakes.
 */
export interface CompanyNameSpace<Sector> {
  readonly size: number;
  /** Number of rows with all-distinct roots (the number of roots). */
  readonly distinctRoots: number;
  name(index: number, rng: Rng): CompanyName<Sector>;
}

export function createCompanyNameSpace<Sector>(
  seed: string,
  sectors: readonly (readonly [trade: string, sector: Sector])[],
): CompanyNameSpace<Sector> {
  const tradeSlugs = sectors.map(([trade]) => toAsciiSlug(trade, '-'));
  const roots = AREAS.flatMap((area) => COMPANY_ROOTS[area].map((root) => ({ area, root, slug: toAsciiSlug(root, '-') })));
  const rootCount = roots.length;
  const tradeCount = sectors.length;
  const size = rootCount * tradeCount;
  const rootOrder = createPermutation(rootCount, `${seed}/roots`);
  const tradeOffset = createPermutation(tradeCount, `${seed}/trades`);
  // The strings of every root x trade are built once, up front (a few thousand), and shared by every
  // row (and later cycle) that uses them. Index: root * tradeCount + trade.
  const bases = Array.from({ length: size }, (_, slot) => {
    const { area, root, slug } = roots[Math.floor(slot / tradeCount)]!;
    const tradeIndex = slot % tradeCount;
    const [trade, sector] = sectors[tradeIndex]!;
    const domain = `${slug}-${tradeSlugs[tradeIndex]}.example`;
    return { area, choices: AREA_CHOICES.get(area)!, sector, stem: `${root} ${trade}`, domain, website: `https://www.${domain}` };
  });
  const slotOf = (index: number): number => {
    const i = index % size;
    const position = i % rootCount;
    const block = Math.floor(i / rootCount);
    // Within a block the roots are a permutation; the trade of a root moves by one per block, so a
    // root never meets the same trade twice before every trade has been used (block < tradeCount).
    const root = rootOrder(position);
    const trade = (tradeOffset(root % tradeCount) + Math.floor(root / tradeCount) + block) % tradeCount;
    return root * tradeCount + trade;
  };
  return {
    size,
    distinctRoots: rootCount,
    name(index, rng) {
      const base = bases[slotOf(index)]!;
      const choice = rng.weighted(base.choices);
      return {
        name: `${base.stem} ${rng.pick(choice.forms)}`,
        area: base.area,
        country: choice.info.code,
        countryInfo: choice.info,
        sector: base.sector,
        domain: base.domain,
        website: base.website,
      };
    },
  };
}
