// Neutral records: a generic "Item / Record" universe with no business domain (no orders, invoices,
// products...), for the base story of every component. Same contract as every other generator (see
// index.ts); the variety it carries (accents, very long and very short texts, absent values, four
// currencies) is what the edge cases of a list or a form need. Texts must stay neutral: `DOMAIN_TERMS`
// lists the words that must never appear, and `records.test.ts` proves it on the first 1,000 records.
import type { StatusBadgeTone } from '../../status-badge/StatusBadge';
import { convertFromEurMinor, type DemoCurrency } from './currency';
import { createDataset, indexFromId } from './dataset';
import { addDays, daysAgo } from './dates';
import { AREA_COUNTRIES, DEMO_COUNTRIES, makeAddress, type DemoAddress, type DemoLanguageArea } from './geo';
import { personName } from './people';
import { createRowRng, hashSeed, type Rng } from './rng';

export type DemoRecordStatus = 'active' | 'pending' | 'on-hold' | 'archived';
export type DemoRecordCategory = 'a' | 'b' | 'c' | 'd' | 'e';

export interface DemoRecord {
  /** Stable id, e.g. `rec-12`. */
  readonly id: string;
  /** `REC-<sequence, at least 5 digits>`, e.g. `REC-00012`. */
  readonly code: string;
  /** Short title, about a third of them with accented letters. */
  readonly name: string;
  /** From a few words (under 30 characters) to a long paragraph (over 120), to exercise truncation. */
  readonly description: string;
  readonly status: DemoRecordStatus;
  readonly category: DemoRecordCategory;
  /** A person of `people.ts`. */
  readonly ownerName: string;
  /** Integer minor units of `currency` (JPY has no decimals, see `CURRENCY_MINOR_DIGITS`). */
  readonly amountMinor: number;
  readonly currency: DemoCurrency;
  /** 1 to 40. */
  readonly quantity: number;
  /** ISO date before `DEMO_TODAY`. */
  readonly createdOn: string;
  /** ISO date after `createdOn`, or `null` (about one record in five has none). */
  readonly dueOn: string | null;
}

export interface DemoRecordItem {
  /** Unique per record and stable, `<record id>-item-<n>`. */
  readonly id: string;
  readonly label: string;
  readonly quantity: number;
  /** Minor units of the record's currency. */
  readonly amountMinor: number;
}

export interface DemoRecordDetail extends DemoRecord {
  readonly details: { readonly reference: string; readonly notes: string | null };
  readonly location: DemoAddress;
  /** 0 to 8 rows, each with a stable id. */
  readonly items: readonly DemoRecordItem[];
  readonly tags: readonly string[];
}

export const RECORD_STATUS_LABEL: Readonly<Record<DemoRecordStatus, string>> = Object.freeze({
  active: 'Active',
  pending: 'Pending',
  'on-hold': 'On hold',
  archived: 'Archived',
});

export const RECORD_STATUS_TONE: Readonly<Record<DemoRecordStatus, StatusBadgeTone>> = Object.freeze({
  active: 'success',
  pending: 'info',
  'on-hold': 'warning',
  archived: 'neutral',
});

export const RECORD_CATEGORY_LABEL: Readonly<Record<DemoRecordCategory, string>> = Object.freeze({
  a: 'Category A',
  b: 'Category B',
  c: 'Category C',
  d: 'Category D',
  e: 'Category E',
});

/**
 * Words of business domains that a neutral text must never contain (whole words, any case). The tests
 * of the neutral dataset scan every text field against this list; the guard of the Docs (#625) can reuse it.
 */
export const DOMAIN_TERMS: readonly string[] = Object.freeze([
  'invoice',
  'supplier',
  'customer',
  'employee',
  'purchase order',
  'sales order',
  'product',
  'SKU',
  'warehouse',
  'stock',
  'course',
  'enrolment',
  'enrollment',
  'learner',
  'cart',
  'checkout',
  'support case',
  'ticket',
  'payroll',
  'VAT',
]);

const DOMAIN_TERMS_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${DOMAIN_TERMS.map((term) => term.replace(/ /g, '\\s+')).join('|')})(?![\\p{L}\\p{N}])`,
  'iu',
);

/** The first domain term found in `text` as a whole word (any case), or `undefined`. */
export function findDomainTerm(text: string): string | undefined {
  return DOMAIN_TERMS_PATTERN.exec(text)?.[0];
}

const SEED = hashSeed('demo-data/records');
const DETAIL_SEED = hashSeed('demo-data/records/detail');

const STATUS_WEIGHTS: readonly (readonly [DemoRecordStatus, number])[] = [
  ['active', 50],
  ['pending', 22],
  ['on-hold', 14],
  ['archived', 14],
];
const CATEGORIES: readonly DemoRecordCategory[] = ['a', 'b', 'c', 'd', 'e'];
const CURRENCY_WEIGHTS: readonly (readonly [DemoCurrency, number])[] = [
  ['EUR', 50],
  ['USD', 25],
  ['GBP', 15],
  ['JPY', 10],
];
const AREAS = Object.keys(AREA_COUNTRIES) as DemoLanguageArea[];

// Plain words only. A third of the first words carry an accent (search and sorting need them).
const NAME_FIRST = [
  'Café', 'Crème', 'Façade', 'Über', 'Señal', 'Ångström', 'Élan', 'Naïve', 'Jalapeño', 'Zoë',
  'Amber', 'Birch', 'Cedar', 'Delta', 'Ember', 'Fjord', 'Granite', 'Harbor', 'Indigo', 'Juniper',
  'Kestrel', 'Lumen', 'Meadow', 'Nimbus', 'Orchid', 'Pebble', 'Quartz', 'Ridge', 'Summit', 'Tundra',
];
const NAME_SECOND = [
  'Overview', 'Summary', 'Review', 'Draft', 'Plan', 'Report', 'Batch', 'Entry', 'Brief', 'Outline',
  'Checklist', 'Proposal', 'Archive', 'Sample', 'Release', 'Update',
];

const SHORT_DESCRIPTIONS = [
  'Short note.',
  'Needs a review.',
  'No remarks.',
  'Waiting for input.',
  'Reviewed twice.',
  'Standard entry.',
  'Added by hand.',
  'See the notes.',
  'Nothing to add.',
  'Pending sign-off.',
];
const SENTENCES = [
  'This record groups the material gathered during the first review round.',
  'It was updated after the latest round of comments from the team.',
  'Every value was checked against the reference sheet shared at the start.',
  'Some entries still need a second look before the final sign-off.',
  'The owner asked to keep the history of changes next to the main text.',
  'A longer description helps to see how the table truncates a cell that does not fit.',
  'The figures are rounded and may differ slightly from the source files.',
  'Please keep the wording short when the text is copied to another list.',
  'Related notes are kept in the attachments and in the shared folder.',
  'The next review is planned once all pending items have been closed.',
  'Nothing in this record depends on an external system.',
  'The label was chosen to be easy to find with the search box.',
];

const ITEM_LABELS = [
  'Setup', 'Review', 'Handling', 'Extra copy', 'Revision', 'Packaging', 'Delivery', 'Assembly', 'Training', 'Consulting',
  'Inspection', 'Repair', 'Upgrade', 'Cleaning', 'Transport', 'Storage fee',
];
const TAGS = ['urgent', 'internal', 'draft', 'reviewed', 'recurring', 'external', 'priority', 'archived-soon', 'pilot', 'seasonal'];
const NOTES = [
  'Remember to confirm the details before the end of the week.',
  'The owner is on leave until the first of the month.',
  'Review again after the next update.',
  'Shared with the whole team.',
];
/** [number of items, weight]: 0 to 8, the empty case included on purpose. */
const ITEM_COUNTS: readonly (readonly [number, number])[] = [
  [0, 14],
  [1, 14],
  [2, 14],
  [3, 14],
  [4, 12],
  [5, 10],
  [6, 8],
  [7, 7],
  [8, 7],
];

function describeRecord(rng: Rng): string {
  const roll = rng.next();
  if (roll < 0.22) return rng.pick(SHORT_DESCRIPTIONS);
  // 4 to 6 sentences are always over 120 characters; 1 to 2 sit between the two extremes.
  const count = roll < 0.45 ? rng.int(4, 6) : rng.int(1, 2);
  const first = rng.int(0, SENTENCES.length - 1);
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(SENTENCES[(first + i * 5) % SENTENCES.length]!);
  return out.join(' ');
}

/** Minor units of `currency` for an amount drawn in euro cents; whole hundreds of yen. */
function amountIn(currency: DemoCurrency, eurMinor: number): number {
  return convertFromEurMinor(eurMinor, currency, currency === 'JPY' ? 100 : 1);
}

function makeRecord(index: number): DemoRecord {
  const rng = createRowRng(SEED, index);
  const currency = rng.weighted(CURRENCY_WEIGHTS);
  const owner = personName(rng.pick(AREAS), rng.int(0, 399));
  const createdOn = daysAgo(rng.int(2, 700));
  const hasDue = rng.chance(0.78);
  const dueDays = rng.int(7, 150);
  return Object.freeze({
    id: `rec-${index + 1}`,
    code: `REC-${String(index + 1).padStart(5, '0')}`,
    name: `${rng.pick(NAME_FIRST)} ${rng.pick(NAME_SECOND)}`,
    description: describeRecord(rng),
    status: rng.weighted(STATUS_WEIGHTS),
    category: rng.pick(CATEGORIES),
    ownerName: owner.fullName,
    amountMinor: amountIn(currency, rng.int(500, 900_000)),
    currency,
    quantity: rng.int(1, 40),
    createdOn,
    dueOn: hasDue ? addDays(createdOn, dueDays) : null,
  });
}

const records = createDataset('makeRecords', makeRecord);

/**
 * The first `n` neutral records, frozen and cached per `n`. Row `i` is the same for every `n`. Throws a
 * `RangeError` on a negative or non-integer `n`.
 */
export const makeRecords = (n: number): readonly DemoRecord[] => records.make(n);

/** The record of any well-formed id (`rec-<positive integer>`), generated on demand, or `undefined`. */
export function getRecord(id: string): DemoRecord | undefined {
  const index = indexFromId(id, 'rec-');
  return index < 0 ? undefined : records.at(index);
}

/**
 * The record plus its nested detail: an object (`details`), an address (`location`), 0 to 8 rows
 * (`items`, ids unique per record and stable) and a list of strings (`tags`). Generated on demand,
 * always the same, deeply frozen. Throws on an id that is not a record (no silent `undefined`).
 */
export function getRecordDetail(id: string): DemoRecordDetail {
  const record = getRecord(id);
  if (!record) throw new Error(`getRecordDetail: no record with id ${JSON.stringify(id)}`);
  const rng = createRowRng(DETAIL_SEED, indexFromId(id, 'rec-'));
  const country = DEMO_COUNTRIES[rng.weighted(AREA_COUNTRIES[rng.pick(AREAS)])];
  const count = rng.weighted(ITEM_COUNTS);
  const items: DemoRecordItem[] = [];
  for (let n = 1; n <= count; n++) {
    items.push(
      Object.freeze({
        id: `${record.id}-item-${n}`,
        label: rng.pick(ITEM_LABELS),
        quantity: rng.int(1, 12),
        amountMinor: amountIn(record.currency, rng.int(200, 90_000)),
      }),
    );
  }
  const tags: string[] = [];
  const tagCount = rng.int(0, 4);
  for (let t = 0; t < tagCount; t++) {
    const tag = rng.pick(TAGS);
    if (!tags.includes(tag)) tags.push(tag);
  }
  return Object.freeze({
    ...record,
    details: Object.freeze({
      reference: `REF-${String(rng.int(0, 999_999)).padStart(6, '0')}`,
      notes: rng.chance(0.6) ? rng.pick(NOTES) : null,
    }),
    location: makeAddress(rng, country),
    items: Object.freeze(items),
    tags: Object.freeze(tags),
  });
}
