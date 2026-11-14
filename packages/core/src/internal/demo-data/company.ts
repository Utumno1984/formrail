// The fictional company of the demo universe. Its name is written ONCE, here (a test checks that no
// other file of demo-data/ contains it, and the dist test that it never reaches the published bundle):
// renaming the company is a one-line change. Everything else (legal names, e-mail domain, web site)
// is derived from it.
import type { DemoCurrency } from './currency';
import type { DemoCountryCode } from './geo';

const NAME = 'Halvane Industrial';

/** The host-name label of the company (`<label>.example`), derived from the first word of its name. */
const DOMAIN_LABEL = NAME.split(' ')[0]!.toLowerCase();

/** A company of the group: the headquarters or a subsidiary. */
export interface DemoLegalEntity {
  /** Stable id (`ent-<country>`), referenced by employees, customers and warehouses. */
  readonly id: string;
  readonly legalName: string;
  readonly country: DemoCountryCode;
  readonly city: string;
  /** Functional currency: what the entity invoices its customers in. */
  readonly currency: DemoCurrency;
}

export interface DemoWarehouse {
  /** Stable id (`wh-<code>`), referenced by the stock levels of the products. */
  readonly id: string;
  readonly name: string;
  readonly entityId: string;
  readonly city: string;
  readonly country: DemoCountryCode;
}

export interface DemoCompany {
  readonly name: string;
  readonly description: string;
  /** Reserved `.example` domain (RFC 2606): every employee e-mail is `<name>@<domain>`. */
  readonly domain: string;
  readonly website: string;
  readonly baseCurrency: DemoCurrency;
  /** Every currency the group trades in. */
  readonly currencies: readonly DemoCurrency[];
  readonly headquarters: DemoLegalEntity & { readonly address: string };
  readonly subsidiaries: readonly DemoLegalEntity[];
  readonly warehouses: readonly DemoWarehouse[];
}

const headquarters = Object.freeze({
  id: 'ent-nl',
  legalName: `${NAME} B.V.`,
  country: 'NL',
  city: 'Rotterdam',
  currency: 'EUR',
  address: 'Havenkade 120, 3089 KL Rotterdam, Netherlands',
} as const);

const subsidiaries: readonly DemoLegalEntity[] = Object.freeze([
  Object.freeze({ id: 'ent-us', legalName: `${NAME} Inc.`, country: 'US', city: 'Columbus', currency: 'USD' }),
  Object.freeze({ id: 'ent-gb', legalName: `${NAME} Ltd`, country: 'GB', city: 'Birmingham', currency: 'GBP' }),
  Object.freeze({ id: 'ent-de', legalName: `${NAME} GmbH`, country: 'DE', city: 'Duisburg', currency: 'EUR' }),
  Object.freeze({ id: 'ent-jp', legalName: `${NAME} Japan K.K.`, country: 'JP', city: 'Osaka', currency: 'JPY' }),
] as const);

const warehouses: readonly DemoWarehouse[] = Object.freeze([
  Object.freeze({ id: 'wh-rtm', name: 'Rotterdam Distribution Center', entityId: 'ent-nl', city: 'Rotterdam', country: 'NL' }),
  Object.freeze({ id: 'wh-dui', name: 'Duisburg Hub', entityId: 'ent-de', city: 'Duisburg', country: 'DE' }),
  Object.freeze({ id: 'wh-bhm', name: 'Birmingham Warehouse', entityId: 'ent-gb', city: 'Birmingham', country: 'GB' }),
  Object.freeze({ id: 'wh-cmh', name: 'Columbus Warehouse', entityId: 'ent-us', city: 'Columbus', country: 'US' }),
  Object.freeze({ id: 'wh-osa', name: 'Osaka Warehouse', entityId: 'ent-jp', city: 'Osaka', country: 'JP' }),
] as const);

/** The fictional company every demo record belongs to (an original name, not affiliated with anyone). */
export const DEMO_COMPANY: DemoCompany = Object.freeze({
  name: NAME,
  description:
    'European B2B distributor of industrial supplies (fasteners, bearings, fluid power, electrical, tools, safety wear), with subsidiaries in the United States, the United Kingdom, Germany and Japan.',
  domain: `${DOMAIN_LABEL}.example`,
  website: `https://www.${DOMAIN_LABEL}.example`,
  baseCurrency: 'EUR',
  currencies: Object.freeze(['EUR', 'USD', 'GBP', 'JPY'] as const),
  headquarters,
  subsidiaries,
  warehouses,
});

/** The headquarters followed by the subsidiaries: every entity an `entityId` can point to. */
export const DEMO_LEGAL_ENTITIES: readonly DemoLegalEntity[] = Object.freeze([headquarters, ...subsidiaries]);
