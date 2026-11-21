// Courses of the company's academy: training for the staff of its customers (safety, product use,
// compliance) and for its own employees. A course has 2 to 12 modules, a list price per currency and an
// instructor among the first employees. Draft courses are not published yet, hence have no enrolment.
import type { StatusBadgeTone } from '../../status-badge/StatusBadge';
import { convertFromEurMinor, type DemoCurrency } from './currency';
import { createDataset, DEMO_REFERENCE_POOL, indexFromId } from './dataset';
import { daysAgo } from './dates';
import { makeEmployees } from './employees';
import type { DemoPrices } from './products';
import { createRowRng, hashSeed, type Rng } from './rng';

export type DemoCourseCategory = 'safety' | 'product-training' | 'compliance' | 'soft-skills';
export type DemoCourseFormat = 'self-paced' | 'live' | 'blended';
export type DemoCourseStatus = 'draft' | 'published' | 'retired';

export interface DemoCourseModule {
  /** Stable id, `<course id>-mod-<n>`, e.g. `crs-12-mod-3`. */
  readonly id: string;
  readonly title: string;
  readonly minutes: number;
}

export interface DemoCourse {
  /** Stable id, e.g. `crs-12`. */
  readonly id: string;
  /** Catalogue code, `ACD-<n>`, e.g. `ACD-10012`. Unique. */
  readonly code: string;
  readonly title: string;
  readonly category: DemoCourseCategory;
  readonly format: DemoCourseFormat;
  readonly status: DemoCourseStatus;
  /** Sum of the minutes of the modules. */
  readonly durationMinutes: number;
  /** An active employee among the first `DEMO_REFERENCE_POOL.employees`. */
  readonly instructorId: string;
  /** Price per seat in each currency, minor units (yen have none). */
  readonly listPriceMinor: DemoPrices;
  /** 2 to 12 modules, in teaching order. */
  readonly modules: readonly DemoCourseModule[];
  /** ISO date before `DEMO_TODAY`; `null` for a `draft`. */
  readonly publishedOn: string | null;
}

export const COURSE_STATUS_LABEL: Readonly<Record<DemoCourseStatus, string>> = Object.freeze({
  draft: 'Draft',
  published: 'Published',
  retired: 'Retired',
});

export const COURSE_STATUS_TONE: Readonly<Record<DemoCourseStatus, StatusBadgeTone>> = Object.freeze({
  draft: 'neutral',
  published: 'success',
  retired: 'warning',
});

export const COURSE_CATEGORY_LABEL: Readonly<Record<DemoCourseCategory, string>> = Object.freeze({
  safety: 'Safety',
  'product-training': 'Product training',
  compliance: 'Compliance',
  'soft-skills': 'Soft skills',
});

export const COURSE_FORMAT_LABEL: Readonly<Record<DemoCourseFormat, string>> = Object.freeze({
  'self-paced': 'Self-paced',
  live: 'Live session',
  blended: 'Blended',
});

const STATUS_WEIGHTS: readonly (readonly [DemoCourseStatus, number])[] = [
  ['draft', 12],
  ['published', 74],
  ['retired', 14],
];
const CATEGORY_WEIGHTS: readonly (readonly [DemoCourseCategory, number])[] = [
  ['safety', 34],
  ['product-training', 30],
  ['compliance', 20],
  ['soft-skills', 16],
];
const FORMAT_WEIGHTS: readonly (readonly [DemoCourseFormat, number])[] = [
  ['self-paced', 50],
  ['live', 20],
  ['blended', 30],
];
const MODULE_COUNTS: readonly (readonly [number, number])[] = [
  [2, 12],
  [3, 20],
  [4, 18],
  [5, 14],
  [6, 12],
  [8, 10],
  [10, 8],
  [12, 6],
];

const TOPICS: Readonly<Record<DemoCourseCategory, readonly string[]>> = {
  safety: [
    'Working at height',
    'Forklift operation',
    'Manual handling and lifting',
    'Chemical storage and labelling',
    'Lockout and tagout',
    'Fire prevention in warehouses',
    'Personal protective equipment',
    'First aid at the workplace',
    'Confined space entry',
    'Safe use of power tools',
  ],
  'product-training': [
    'Fastener selection and torque',
    'Hydraulic fittings and hoses',
    'Bearings: fitting and maintenance',
    'Cutting tools and abrasives',
    'Safe use of ratchet straps and slings',
    'Sealants, adhesives and lubricants',
    'Pneumatic components',
    'Reading product datasheets',
    'Selecting welding consumables',
    'Care of industrial hand tools',
  ],
  compliance: [
    'Export controls and sanctions',
    'Anti-bribery and gifts',
    'Data protection basics',
    'Product traceability and recalls',
    'Customs classification',
    'Supplier code of conduct',
    'Hazardous goods transport',
    'Competition law essentials',
  ],
  'soft-skills': [
    'Handling difficult customer calls',
    'Writing clear emails',
    'Running effective meetings',
    'Giving and receiving feedback',
    'Negotiating with suppliers',
    'Time management for team leads',
  ],
};
const LEVELS: readonly string[] = ['Fundamentals', 'Advanced', 'Refresher', 'for supervisors', 'for new starters', 'in practice'];
// Over 60 characters: exercises truncation in lists and cards.
const LONG_TITLES: Readonly<Record<DemoCourseCategory, readonly string[]>> = {
  safety: [
    'Safe handling, storage and transport of compressed gas cylinders in warehouses and loading yards',
    'Risk assessment and permit-to-work procedures for contractors on customer sites and loading docks',
  ],
  'product-training': [
    'Choosing, installing and inspecting lifting slings, shackles and hoist rings for general industrial use',
    'Troubleshooting leaking hydraulic couplings: diagnosis, replacement and pressure testing on site',
  ],
  compliance: [
    'Recording, labelling and reporting of non-conforming products under the quality management system',
    'Customs declarations, origin rules and preferential tariffs for goods shipped outside the union',
  ],
  'soft-skills': [
    'Explaining technical limits to non-technical buyers without losing the order or the relationship',
    'Facilitating handovers between shifts, departments and sites so that nothing is lost in between',
  ],
};
const MODULE_TITLES: readonly string[] = [
  'Introduction and objectives',
  'Hazards and risks',
  'Regulations and standards',
  'Equipment overview',
  'Step by step procedure',
  'Inspection checklist',
  'Common mistakes',
  'Case study',
  'Practical exercise',
  'Handling incidents',
  'Record keeping',
  'Summary and knowledge check',
  'Roles and responsibilities',
  'Preparing the work area',
  'Maintenance and storage',
];
const LONG_MODULE_TITLES: readonly string[] = [
  'Reading the manufacturer instructions, the safety data sheet and the site specific rules before starting',
  'Reporting near misses and incidents through the right channel, and what happens to the report afterwards',
];

const SEED = hashSeed('demo-data/courses');

/** Seat price in EUR minor units by format (a live session costs more than a self-paced course). */
const BASE_EUR_MINOR: Readonly<Record<DemoCourseFormat, readonly [number, number]>> = {
  'self-paced': [4900, 19900],
  live: [24900, 89900],
  blended: [14900, 49900],
};
const PRICE_STEP: Readonly<Record<DemoCurrency, number>> = { EUR: 100, USD: 100, GBP: 100, JPY: 1000 };
const priceIn = (eurMinor: number, currency: DemoCurrency): number =>
  Math.max(PRICE_STEP[currency], convertFromEurMinor(eurMinor, currency, PRICE_STEP[currency]));

let instructors: readonly string[] | undefined;
function instructorIds(): readonly string[] {
  return (instructors ??= makeEmployees(DEMO_REFERENCE_POOL.employees)
    .filter((e) => e.status === 'active' && e.managerId !== null)
    .map((e) => e.id));
}

function makeModules(rng: Rng, id: string, format: DemoCourseFormat): readonly DemoCourseModule[] {
  const count = rng.weighted(MODULE_COUNTS);
  // Consecutive titles of the list: distinct within a course (at most 12 of 15).
  const first = rng.int(0, MODULE_TITLES.length - 1);
  const modules = new Array<DemoCourseModule>(count);
  for (let k = 0; k < count; k++) {
    modules[k] = Object.freeze({
      id: `${id}-mod-${k + 1}`,
      title: rng.chance(0.04) ? rng.pick(LONG_MODULE_TITLES) : MODULE_TITLES[(first + k) % MODULE_TITLES.length]!,
      minutes: format === 'live' ? 30 * rng.int(2, 6) : 5 * rng.int(3, 18),
    });
  }
  return Object.freeze(modules);
}

function makeCourse(index: number): DemoCourse {
  const rng = createRowRng(SEED, index);
  const id = `crs-${index + 1}`;
  const status = rng.weighted(STATUS_WEIGHTS);
  const category = rng.weighted(CATEGORY_WEIGHTS);
  const format = rng.weighted(FORMAT_WEIGHTS);
  const topic = rng.pick(TOPICS[category]);
  const title = rng.chance(0.07) ? rng.pick(LONG_TITLES[category]) : `${topic}: ${rng.pick(LEVELS)}`;
  const modules = makeModules(rng, id, format);
  let durationMinutes = 0;
  for (let k = 0; k < modules.length; k++) durationMinutes += modules[k]!.minutes;
  const [low, high] = BASE_EUR_MINOR[format];
  const eur = Math.round(rng.int(low, high) / 100) * 100;
  const pool = instructorIds();
  return Object.freeze({
    id,
    code: `ACD-${10001 + index}`,
    title,
    category,
    format,
    status,
    durationMinutes,
    instructorId: pool[rng.int(0, pool.length - 1)]!,
    listPriceMinor: Object.freeze({
      EUR: priceIn(eur, 'EUR'),
      USD: priceIn(eur, 'USD'),
      GBP: priceIn(eur, 'GBP'),
      JPY: priceIn(eur, 'JPY'),
    }),
    modules,
    publishedOn: status === 'draft' ? null : daysAgo(status === 'retired' ? rng.int(400, 1500) : rng.int(20, 900)),
  });
}

const courses = createDataset('makeCourses', makeCourse);

/** The row of a course by index (shared with the enrolments). */
export const courseAt = (index: number): DemoCourse => courses.at(index);

/**
 * The first `n` courses, frozen and cached per `n`. Row `i` is the same for every `n`. Every
 * `instructorId` is among `makeEmployees(DEMO_REFERENCE_POOL.employees)`. A `draft` course has no
 * `publishedOn` and no enrolment. Throws on a negative or non-integer `n`.
 */
export const makeCourses = (n: number): readonly DemoCourse[] => courses.make(n);

/** The course of any well-formed id (`crs-<positive integer>`), generated on demand, or `undefined`. */
export function getCourse(id: string): DemoCourse | undefined {
  const index = indexFromId(id, 'crs-');
  return index < 0 ? undefined : courses.at(index);
}
