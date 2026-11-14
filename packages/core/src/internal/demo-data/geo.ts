// Countries, cities and postal addresses of the demo universe. City and street names keep their local
// spelling (München, Malmö, Kraków, Industriestraße, Bjørkeveien) so search, sorting and truncation meet
// real accents, `ß` and `ø`; only Latin scripts (right-to-left is not supported yet, spec §1.13.4).
// Phone numbers use the ranges reserved for fiction where a country has one (NANP 555-01xx, Ofcom
// drama ranges), and a `555 0xxx` subscriber pattern elsewhere.
import type { DemoCurrency } from './currency';
import type { Rng } from './rng';

/** The language areas personal and company names are drawn from. */
export type DemoLanguageArea = 'en' | 'de' | 'nl' | 'fr' | 'es' | 'it' | 'nordic' | 'pl' | 'ja';

/** ISO 3166-1 alpha-2 codes of the countries in the demo universe. */
export type DemoCountryCode =
  | 'NL'
  | 'BE'
  | 'DE'
  | 'AT'
  | 'CH'
  | 'FR'
  | 'ES'
  | 'IT'
  | 'IE'
  | 'GB'
  | 'SE'
  | 'DK'
  | 'NO'
  | 'PL'
  | 'US'
  | 'JP';

/** A postal address. `line2` and `region` are `null` when absent, never `''`. */
export interface DemoAddress {
  readonly line1: string;
  readonly line2: string | null;
  readonly postalCode: string;
  readonly city: string;
  /** US state or Japanese prefecture, Italian province code; `null` where addresses do not use one. */
  readonly region: string | null;
  readonly country: DemoCountryCode;
}

interface City {
  readonly name: string;
  readonly region: string | null;
  /** Trunk/area code used in phone numbers. */
  readonly phoneArea: string;
  readonly postal: (rng: Rng) => string;
}

export interface DemoCountry {
  readonly code: DemoCountryCode;
  readonly name: string;
  readonly area: DemoLanguageArea;
  readonly callingCode: string;
  /** The currency customers of this country are invoiced in (one of the group's currencies). */
  readonly currency: DemoCurrency;
  /** The group entity that serves customers of this country. */
  readonly entityId: string;
  /** The format of its postal codes, the one generated addresses follow. */
  readonly postalCodePattern: RegExp;
  readonly cities: readonly City[];
  readonly line1: (rng: Rng) => string;
}

const pad = (value: number, width: number): string => String(value).padStart(width, '0');
/** A zero-padded integer in `[from, to]`. */
const range = (from: number, to: number, width: number) => (rng: Rng) => pad(rng.int(from, to), width);
const letters = (rng: Rng, alphabet: string, count: number): string => {
  let out = '';
  for (let i = 0; i < count; i++) out += alphabet[rng.int(0, alphabet.length - 1)];
  return out;
};

const dutch = (from: number, to: number) => (rng: Rng) => `${rng.int(from, to)} ${letters(rng, 'ABCEGHJKLMNPRTVWXZ', 2)}`;
const swedish = (from: number, to: number) => (rng: Rng) => {
  const code = pad(rng.int(from, to), 5);
  return `${code.slice(0, 3)} ${code.slice(3)}`;
};
const polish = (from: number, to: number) => (rng: Rng) => {
  const code = pad(rng.int(from, to), 5);
  return `${code.slice(0, 2)}-${code.slice(2)}`;
};
const japanese = (from: number, to: number) => (rng: Rng) => `${rng.int(from, to)}-${pad(rng.int(1, 9999), 4)}`;
const british = (district: string, from: number, to: number) => (rng: Rng) =>
  `${district}${rng.int(from, to)} ${rng.int(0, 9)}${letters(rng, 'ABDEFGHJLNPQRSTUWXYZ', 2)}`;
const irish = (routingKeys: readonly string[]) => (rng: Rng) =>
  `${rng.pick(routingKeys)} ${letters(rng, 'ACDEFHKNPRTVWXY', 1)}${letters(rng, 'ACDEFHKNPRTVWXY0123456789', 3)}`;

const city = (name: string, phoneArea: string, postal: (rng: Rng) => string, region: string | null = null): City =>
  Object.freeze({ name, region, phoneArea, postal });

const streetFirst = (streets: readonly string[], separator = ' ') => (rng: Rng) =>
  `${rng.pick(streets)}${separator}${rng.int(1, 240)}`;
const numberFirst = (streets: readonly string[]) => (rng: Rng) => `${rng.int(1, 2400)} ${rng.pick(streets)}`;

const ENGLISH_STREETS = ['Station Road', 'Mill Lane', 'Canal Street', 'Foundry Way', 'Harbour Road', 'Victoria Street', 'Kingsway'];
const DUTCH_STREETS = ['Industrieweg', 'Havenstraat', 'Kanaaldijk', 'Energieweg', 'Ambachtsweg', 'Zuiderkade'];
const GERMAN_STREETS = ['Industriestraße', 'Hafenstraße', 'Gewerbering', 'Lindenallee', 'Am Güterbahnhof', 'Werkstraße', 'Mühlenweg'];
const SWISS_STREETS = ['Industriestrasse', 'Bahnhofstrasse', 'Gewerbestrasse', 'Seestrasse'];

const COUNTRY_LIST: readonly DemoCountry[] = (
  [
  {
    code: 'NL',
    name: 'Netherlands',
    area: 'nl',
    callingCode: '31',
    currency: 'EUR',
    entityId: 'ent-nl',
    postalCodePattern: /^[1-9]\d{3} [A-Z]{2}$/,
    cities: [
      city('Rotterdam', '10', dutch(3011, 3089)),
      city('Eindhoven', '40', dutch(5611, 5658)),
      city('Utrecht', '30', dutch(3511, 3585)),
      city('Groningen', '50', dutch(9711, 9747)),
      city('Tilburg', '13', dutch(5011, 5049)),
    ],
    line1: streetFirst(DUTCH_STREETS),
  },
  {
    code: 'BE',
    name: 'Belgium',
    area: 'nl',
    callingCode: '32',
    currency: 'EUR',
    entityId: 'ent-nl',
    postalCodePattern: /^[1-9]\d{3}$/,
    cities: [
      city('Antwerpen', '3', range(2000, 2660, 4)),
      city('Gent', '9', range(9000, 9052, 4)),
      city('Leuven', '16', range(3000, 3012, 4)),
      city('Mechelen', '15', range(2800, 2812, 4)),
    ],
    line1: streetFirst(['Industrielaan', 'Nijverheidsstraat', 'Havenlaan', 'Kouterstraat']),
  },
  {
    code: 'DE',
    name: 'Germany',
    area: 'de',
    callingCode: '49',
    currency: 'EUR',
    entityId: 'ent-de',
    postalCodePattern: /^\d{5}$/,
    cities: [
      city('München', '89', range(80331, 81929, 5)),
      city('Hamburg', '40', range(20095, 22769, 5)),
      city('Stuttgart', '711', range(70173, 70629, 5)),
      city('Köln', '221', range(50667, 51149, 5)),
      city('Düsseldorf', '211', range(40210, 40629, 5)),
      city('Nürnberg', '911', range(90402, 90491, 5)),
      city('Leipzig', '341', range(4103, 4357, 5)),
    ],
    line1: streetFirst(GERMAN_STREETS),
  },
  {
    code: 'AT',
    name: 'Austria',
    area: 'de',
    callingCode: '43',
    currency: 'EUR',
    entityId: 'ent-de',
    postalCodePattern: /^[1-9]\d{3}$/,
    cities: [
      city('Wien', '1', range(1010, 1230, 4)),
      city('Graz', '316', range(8010, 8063, 4)),
      city('Linz', '732', range(4020, 4040, 4)),
      city('Salzburg', '662', range(5020, 5026, 4)),
    ],
    line1: streetFirst(['Industriestraße', 'Gewerbestraße', 'Hauptstraße', 'Brunnenweg']),
  },
  {
    code: 'CH',
    name: 'Switzerland',
    area: 'de',
    callingCode: '41',
    currency: 'EUR',
    entityId: 'ent-de',
    postalCodePattern: /^[1-9]\d{3}$/,
    cities: [
      city('Zürich', '44', range(8001, 8099, 4)),
      city('Basel', '61', range(4001, 4059, 4)),
      city('Bern', '31', range(3001, 3030, 4)),
      city('Winterthur', '52', range(8400, 8411, 4)),
    ],
    line1: streetFirst(SWISS_STREETS),
  },
  {
    code: 'FR',
    name: 'France',
    area: 'fr',
    callingCode: '33',
    currency: 'EUR',
    entityId: 'ent-nl',
    postalCodePattern: /^\d{5}$/,
    cities: [
      city('Lyon', '4', range(69001, 69009, 5)),
      city('Toulouse', '5', range(31000, 31500, 5)),
      city('Lille', '3', range(59000, 59800, 5)),
      city('Nantes', '2', range(44000, 44300, 5)),
      city('Grenoble', '4', range(38000, 38100, 5)),
    ],
    line1: (rng) =>
      `${rng.int(1, 180)} ${rng.pick(["rue de l'Industrie", 'boulevard des Ateliers', 'allée des Forges', 'chemin du Moulin', 'avenue de la Gare', 'rue des Frères-Lumière'])}`,
  },
  {
    code: 'ES',
    name: 'Spain',
    area: 'es',
    callingCode: '34',
    currency: 'EUR',
    entityId: 'ent-nl',
    postalCodePattern: /^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/,
    cities: [
      city('Barcelona', '93', range(8001, 8042, 5)),
      city('Valencia', '96', range(46001, 46026, 5)),
      city('Bilbao', '94', range(48001, 48015, 5)),
      city('Zaragoza', '976', range(50001, 50021, 5)),
      city('Sevilla', '95', range(41001, 41020, 5)),
    ],
    line1: streetFirst(['Calle de la Industria', 'Avenida del Puerto', 'Calle Mayor', 'Polígono Industrial Las Peñas', 'Calle de los Herreros'], ', '),
  },
  {
    code: 'IT',
    name: 'Italy',
    area: 'it',
    callingCode: '39',
    currency: 'EUR',
    entityId: 'ent-nl',
    postalCodePattern: /^\d{5}$/,
    cities: [
      city('Milano', '02', range(20121, 20162, 5), 'MI'),
      city('Torino', '011', range(10121, 10156, 5), 'TO'),
      city('Bologna', '051', range(40121, 40141, 5), 'BO'),
      city('Brescia', '030', range(25121, 25136, 5), 'BS'),
      city('Verona', '045', range(37121, 37142, 5), 'VR'),
    ],
    line1: streetFirst(["Via dell'Industria", 'Via dei Mestieri', 'Viale delle Officine', 'Via del Lavoro', 'Corso Europa']),
  },
  {
    code: 'IE',
    name: 'Ireland',
    area: 'en',
    callingCode: '353',
    currency: 'EUR',
    entityId: 'ent-gb',
    postalCodePattern: /^[ACDEFHKNPRTVWXY]\d{2} [ACDEFHKNPRTVWXY][ACDEFHKNPRTVWXY\d]{3}$/,
    cities: [
      city('Dublin', '1', irish(['D01', 'D02', 'D08', 'D11', 'D12', 'D15', 'D24'])),
      city('Cork', '21', irish(['T12', 'T23'])),
      city('Galway', '91', irish(['H91'])),
      city('Limerick', '61', irish(['V94'])),
    ],
    line1: numberFirst(ENGLISH_STREETS),
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    area: 'en',
    callingCode: '44',
    currency: 'GBP',
    entityId: 'ent-gb',
    postalCodePattern: /^[A-Z]{1,2}\d{1,2}[A-Z]? \d[A-Z]{2}$/,
    cities: [
      city('Birmingham', '121', british('B', 1, 45)),
      city('Manchester', '161', british('M', 1, 50)),
      city('Leeds', '113', british('LS', 1, 28)),
      city('Sheffield', '114', british('S', 1, 36)),
      city('Bristol', '117', british('BS', 1, 16)),
      city('Glasgow', '141', british('G', 1, 81)),
    ],
    line1: numberFirst(ENGLISH_STREETS),
  },
  {
    code: 'SE',
    name: 'Sweden',
    area: 'nordic',
    callingCode: '46',
    currency: 'EUR',
    entityId: 'ent-nl',
    postalCodePattern: /^[1-9]\d{2} \d{2}$/,
    cities: [
      city('Göteborg', '31', swedish(41101, 41878)),
      city('Malmö', '40', swedish(21115, 21775)),
      city('Stockholm', '8', swedish(11120, 11861)),
      city('Västerås', '21', swedish(72210, 72591)),
      city('Jönköping', '36', swedish(55302, 55474)),
    ],
    line1: streetFirst(['Industrigatan', 'Hamngatan', 'Verkstadsgatan', 'Storgatan', 'Kvarnvägen']),
  },
  {
    code: 'DK',
    name: 'Denmark',
    area: 'nordic',
    callingCode: '45',
    currency: 'EUR',
    entityId: 'ent-nl',
    postalCodePattern: /^[1-9]\d{3}$/,
    cities: [
      city('Aarhus', '86', range(8000, 8270, 4)),
      city('Odense', '66', range(5000, 5270, 4)),
      city('København', '33', range(1050, 2450, 4)),
      city('Køge', '56', range(4600, 4600, 4)),
      city('Aalborg', '98', range(9000, 9220, 4)),
    ],
    line1: streetFirst(['Industrivej', 'Havnegade', 'Værkstedsvej', 'Nørregade', 'Søndergade']),
  },
  {
    code: 'NO',
    name: 'Norway',
    area: 'nordic',
    callingCode: '47',
    currency: 'EUR',
    entityId: 'ent-nl',
    postalCodePattern: /^\d{4}$/,
    cities: [
      city('Oslo', '22', range(150, 1295, 4)),
      city('Bergen', '55', range(5003, 5096, 4)),
      city('Trondheim', '73', range(7010, 7099, 4)),
      city('Stavanger', '51', range(4006, 4049, 4)),
      city('Tromsø', '77', range(9006, 9020, 4)),
    ],
    line1: streetFirst(['Industriveien', 'Havnegata', 'Storgata', 'Verkstedveien', 'Bjørkeveien']),
  },
  {
    code: 'PL',
    name: 'Poland',
    area: 'pl',
    callingCode: '48',
    currency: 'EUR',
    entityId: 'ent-de',
    postalCodePattern: /^\d{2}-\d{3}$/,
    cities: [
      city('Kraków', '12', polish(30001, 31999)),
      city('Wrocław', '71', polish(50001, 54999)),
      city('Poznań', '61', polish(60001, 61999)),
      city('Gdańsk', '58', polish(80001, 80999)),
      city('Łódź', '42', polish(90001, 94999)),
    ],
    line1: streetFirst(['ul. Przemysłowa', 'ul. Fabryczna', 'ul. Portowa', 'ul. Długa', 'ul. Rzemieślnicza']),
  },
  {
    code: 'US',
    name: 'United States',
    area: 'en',
    callingCode: '1',
    currency: 'USD',
    entityId: 'ent-us',
    postalCodePattern: /^\d{5}$/,
    cities: [
      city('Chicago', '312', range(60601, 60661, 5), 'IL'),
      city('Houston', '713', range(77002, 77099, 5), 'TX'),
      city('Columbus', '614', range(43201, 43235, 5), 'OH'),
      city('Charlotte', '704', range(28202, 28277, 5), 'NC'),
      city('Detroit', '313', range(48201, 48243, 5), 'MI'),
      city('Pittsburgh', '412', range(15201, 15244, 5), 'PA'),
      city('Phoenix', '602', range(85003, 85054, 5), 'AZ'),
    ],
    line1: numberFirst(['Industrial Parkway', 'Commerce Drive', 'Main Street', 'Lakeview Avenue', 'Enterprise Boulevard', 'Mill Road']),
  },
  {
    code: 'JP',
    name: 'Japan',
    area: 'ja',
    callingCode: '81',
    currency: 'JPY',
    entityId: 'ent-jp',
    postalCodePattern: /^\d{3}-\d{4}$/,
    cities: [
      city('Osaka', '6', japanese(530, 559), 'Osaka'),
      city('Nagoya', '52', japanese(450, 468), 'Aichi'),
      city('Yokohama', '45', japanese(220, 247), 'Kanagawa'),
      city('Kobe', '78', japanese(650, 658), 'Hyogo'),
      city('Hamamatsu', '53', japanese(430, 435), 'Shizuoka'),
    ],
    // Japanese block addresses: chome-ban-go, then the ward.
    line1: (rng) => `${rng.int(1, 5)}-${rng.int(1, 30)}-${rng.int(1, 20)} ${rng.pick(['Kita-ku', 'Chuo-ku', 'Nishi-ku', 'Minato-ku', 'Higashi-ku'])}`,
  },
  ] satisfies DemoCountry[]
).map((country) => Object.freeze({ ...country, cities: Object.freeze(country.cities) }));

/** Every country of the demo universe, by code. */
export const DEMO_COUNTRIES: Readonly<Record<DemoCountryCode, DemoCountry>> = Object.freeze(
  Object.fromEntries(COUNTRY_LIST.map((country) => [country.code, country])) as Record<DemoCountryCode, DemoCountry>,
);

/** English country names, for labels. */
export const COUNTRY_NAME: Readonly<Record<DemoCountryCode, string>> = Object.freeze(
  Object.fromEntries(COUNTRY_LIST.map((country) => [country.code, country.name])) as Record<DemoCountryCode, string>,
);

/** The postal-code format of each country (what a form can validate a postal code against). */
export const POSTAL_CODE_PATTERN: Readonly<Record<DemoCountryCode, RegExp>> = Object.freeze(
  Object.fromEntries(COUNTRY_LIST.map((country) => [country.code, country.postalCodePattern])) as Record<DemoCountryCode, RegExp>,
);

/** The countries of each language area, with the weight of each one in the generated data. */
export const AREA_COUNTRIES: Readonly<Record<DemoLanguageArea, readonly (readonly [DemoCountryCode, number])[]>> = Object.freeze({
  en: [['US', 5], ['GB', 4], ['IE', 1]],
  de: [['DE', 7], ['AT', 2], ['CH', 1]],
  nl: [['NL', 3], ['BE', 1]],
  fr: [['FR', 1]],
  es: [['ES', 1]],
  it: [['IT', 1]],
  nordic: [['SE', 5], ['DK', 3], ['NO', 2]],
  pl: [['PL', 1]],
  ja: [['JP', 1]],
});

// City names are unique across countries (tested), so the city alone is the key: no string built per call.
const PHONE_AREA = new Map(COUNTRY_LIST.flatMap((country) => country.cities.map((c) => [c.name, c.phoneArea] as const)));

const UNITS = ['Unit 4', 'Unit 12B', 'Building C', 'Hall 3', 'Gate 2', 'Floor 5', 'Dock 7'];

/** A postal address in `country`. */
export function makeAddress(rng: Rng, code: DemoCountryCode): DemoAddress {
  const country = DEMO_COUNTRIES[code];
  const where = rng.pick(country.cities);
  return Object.freeze({
    line1: country.line1(rng),
    line2: rng.chance(0.25) ? rng.pick(UNITS) : null,
    postalCode: where.postal(rng),
    city: where.name,
    region: where.region,
    country: code,
  });
}

/** A fictional phone number in the city of `address`. */
export function makePhone(rng: Rng, address: DemoAddress): string {
  const country = DEMO_COUNTRIES[address.country];
  const area = PHONE_AREA.get(address.city) ?? country.cities[0]!.phoneArea;
  if (address.country === 'US') return `+1 ${area}-555-01${pad(rng.int(0, 99), 2)}`;
  if (address.country === 'GB') return `+44 ${area} 496 0${pad(rng.int(0, 999), 3)}`;
  return `+${country.callingCode} ${area} 555 0${pad(rng.int(0, 999), 3)}`;
}
