// Support cases of the demo company: a customer writes about a product, a customer service employee
// answers. The list row carries the count of comments; the comments (with authors and timestamps)
// are generated only by `getSupportCase(id)`, and are always the same.
import type { StatusBadgeTone } from '../../status-badge/StatusBadge';
import { makeCustomers } from './customers';
import { createDataset, DEMO_REFERENCE_POOL, indexFromId } from './dataset';
import { daysAgo, daysBetween, DEMO_TODAY } from './dates';
import { getEmployee, pickSupportAgentId } from './employees';
import { ageCache } from './order-lines';
import { makeProducts } from './products';
import { createRowRng, hashSeed, type Rng } from './rng';

export type DemoSupportCaseStatus = 'new' | 'open' | 'pending' | 'resolved' | 'closed';
export type DemoSupportCasePriority = 'low' | 'normal' | 'high' | 'urgent';

/** A comment on a case, by the customer's contact or by the employee the case is assigned to. */
export interface DemoCaseComment {
  /** Stable id, `<case id>-cmt-<n>`, e.g. `cs-12-cmt-2`. */
  readonly id: string;
  readonly authorKind: 'customer' | 'employee';
  /** A contact of the case's customer (`DemoContact.id`) or the assignee (`DemoEmployee.id`). */
  readonly authorId: string;
  readonly authorName: string;
  /** Local date and time `yyyy-mm-ddThh:mm`, no zone. Strictly increasing within a case; never after 18:00 of `DEMO_TODAY`. */
  readonly postedAt: string;
  /** One to three sentences; now and then a long message (about 600 characters) to exercise truncation. */
  readonly text: string;
}

export interface DemoSupportCase {
  /** Stable id, e.g. `cs-12`. */
  readonly id: string;
  /** `CS-<sequence>`, e.g. `CS-10012`. */
  readonly number: string;
  readonly subject: string;
  /** A customer among the first `DEMO_REFERENCE_POOL.customers`. */
  readonly customerId: string;
  /** A product among the first `DEMO_REFERENCE_POOL.products` (never a draft). */
  readonly productId: string;
  readonly priority: DemoSupportCasePriority;
  readonly status: DemoSupportCaseStatus;
  /** A customer service employee who has not left (see `DEMO_REFERENCE_POOL`), or `null`: set on every case but some `new` ones. */
  readonly assigneeId: string | null;
  /** ISO date, never before the customer's `createdOn`, never after `DEMO_TODAY`. */
  readonly openedOn: string;
  /** ISO date the first answer is due: 1 (urgent), 2, 5 or 10 (low) calendar days after `openedOn`. */
  readonly slaDueDate: string;
  /** How many comments `getSupportCase(id).comments` has (0 to 8; 0 for some `new` cases). */
  readonly commentCount: number;
}

export interface DemoSupportCaseDetail extends DemoSupportCase {
  readonly comments: readonly DemoCaseComment[];
}

export const SUPPORT_CASE_STATUS_LABEL: Readonly<Record<DemoSupportCaseStatus, string>> = Object.freeze({
  new: 'New',
  open: 'Open',
  pending: 'Pending customer',
  resolved: 'Resolved',
  closed: 'Closed',
});

export const SUPPORT_CASE_STATUS_TONE: Readonly<Record<DemoSupportCaseStatus, StatusBadgeTone>> = Object.freeze({
  new: 'info',
  open: 'warning',
  pending: 'neutral',
  resolved: 'success',
  closed: 'neutral',
});

export const SUPPORT_CASE_PRIORITY_LABEL: Readonly<Record<DemoSupportCasePriority, string>> = Object.freeze({
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
});

export const SUPPORT_CASE_PRIORITY_TONE: Readonly<Record<DemoSupportCasePriority, StatusBadgeTone>> = Object.freeze({
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  urgent: 'error',
});

const STATUS_WEIGHTS: readonly (readonly [DemoSupportCaseStatus, number])[] = [
  ['new', 12],
  ['open', 30],
  ['pending', 18],
  ['resolved', 20],
  ['closed', 20],
];
const PRIORITY_WEIGHTS: readonly (readonly [DemoSupportCasePriority, number])[] = [
  ['low', 25],
  ['normal', 50],
  ['high', 20],
  ['urgent', 5],
];
const SLA_DAYS: Readonly<Record<DemoSupportCasePriority, number>> = { low: 10, normal: 5, high: 2, urgent: 1 };

/** [youngest, oldest] age in days of the case, by status. */
const CASE_AGE: Readonly<Record<DemoSupportCaseStatus, readonly [number, number]>> = {
  new: [0, 3],
  open: [1, 20],
  pending: [3, 30],
  resolved: [5, 60],
  closed: [20, 400],
};
/** [min, max] comments by status. */
const COMMENT_RANGE: Readonly<Record<DemoSupportCaseStatus, readonly [number, number]>> = {
  new: [0, 1],
  open: [1, 6],
  pending: [2, 6],
  resolved: [3, 8],
  closed: [3, 8],
};

const SUBJECTS: readonly string[] = [
  'Wrong quantity delivered for {sku}',
  'Damaged packaging on {sku}',
  'Certificate of conformity missing for {sku}',
  'Delivery of {sku} is late',
  'Quotation request for {sku}',
  'Invoice price of {sku} does not match the quotation',
  'Return request for {sku}',
  'Technical data sheet needed for {sku}',
  'Substitute for {sku} after the order was cancelled',
];

const CUSTOMER_SENTENCES: readonly string[] = [
  'We received the shipment this morning and found a problem.',
  'Could you please confirm the delivery date for the open order?',
  'The packing slip does not match what is in the boxes.',
  'Our quality department needs the batch certificate before the goods can be released.',
  'This is blocking a production line, so an answer today would help a lot.',
  'Please send a credit note or a replacement, whichever is faster.',
  'I have attached photos of the damaged cartons.',
  'We ordered a larger quantity and need to know whether stock is available.',
  'Thank you for the quick reply, that solves it for us.',
  'Can you also confirm the price for the next order of the same item?',
];
const AGENT_SENTENCES: readonly string[] = [
  'Thank you for getting in touch, I am looking into this now.',
  'I have checked the order and the warehouse record, and I can confirm the discrepancy.',
  'A replacement is on its way and you will receive the tracking number by e-mail.',
  'I have asked the supplier for the certificate and will forward it as soon as I have it.',
  'Could you send a photo of the label and of the damaged packaging?',
  'I am sorry for the inconvenience, a credit note has been issued for the difference.',
  'The item is back in stock at our distribution center and can ship tomorrow.',
  'Please let me know if the replacement arrives complete, and I will close the case.',
  'I have raised the priority with the warehouse team.',
  'The updated quotation is attached to this message.',
];
const LONG_CHANCE = 0.08;

const SEED = hashSeed('demo-data/support-cases');
const COMMENTS_SEED = hashSeed('demo-data/support-cases/comments');

let sellable: readonly number[] | undefined;
let customerAge: ((index: number) => number) | undefined;

/** Minutes after midnight at which "now" is on `DEMO_TODAY`: nothing is posted later. */
const NOW_MINUTE = 18 * 60;

function makeSupportCase(index: number): DemoSupportCase {
  const customers = makeCustomers(DEMO_REFERENCE_POOL.customers);
  const products = makeProducts(DEMO_REFERENCE_POOL.products);
  if (!sellable) {
    sellable = products.flatMap((product, i) => (product.status === 'draft' ? [] : [i]));
    customerAge = ageCache(customers, (createdOn) => daysBetween(createdOn, DEMO_TODAY));
  }
  const rng = createRowRng(SEED, index);
  const status = rng.weighted(STATUS_WEIGHTS);
  const priority = rng.weighted(PRIORITY_WEIGHTS);
  const customerIndex = rng.int(0, customers.length - 1);
  const product = products[sellable[rng.int(0, sellable.length - 1)]!]!;
  const [youngest, oldest] = CASE_AGE[status];
  const oldestAllowed = Math.min(oldest, customerAge!(customerIndex));
  const age = rng.int(Math.min(youngest, oldestAllowed), oldestAllowed);
  const [fewest, most] = COMMENT_RANGE[status];
  const commentCount = rng.int(fewest, most);
  // A `new` case may already be assigned; every other one is.
  const assigneeId = status === 'new' && rng.chance(0.75) ? null : pickSupportAgentId(rng);
  const id = `cs-${index + 1}`;
  return Object.freeze({
    id,
    number: `CS-${10001 + index}`,
    subject: rng.pick(SUBJECTS).replace('{sku}', product.sku),
    customerId: customers[customerIndex]!.id,
    productId: product.id,
    priority,
    status,
    assigneeId,
    openedOn: daysAgo(age),
    slaDueDate: daysAgo(age - SLA_DAYS[priority]),
    commentCount,
  });
}

const pad2 = (value: number): string => (value < 10 ? `0${value}` : String(value));

/** A message of one to three sentences, or (now and then) a long one of eight to ten. */
function message(rng: Rng, sentences: readonly string[]): string {
  const count = rng.chance(LONG_CHANCE) ? rng.int(8, 10) : rng.int(1, 3);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) parts.push(sentences[(rng.int(0, sentences.length - 1) + i) % sentences.length]!);
  return parts.join(' ');
}

function makeSupportCaseDetail(index: number): DemoSupportCaseDetail {
  const supportCase = supportCases.at(index);
  const customer = makeCustomers(DEMO_REFERENCE_POOL.customers)[indexFromId(supportCase.customerId, 'cus-')]!;
  const assignee = supportCase.assigneeId === null ? undefined : getEmployee(supportCase.assigneeId);
  const rng = createRowRng(COMMENTS_SEED, index);
  const openedAge = daysBetween(supportCase.openedOn, DEMO_TODAY);
  const count = supportCase.commentCount;
  // Minutes from the midnight that opens the case to "now"; the steps below add up to at most the budget.
  let minute = rng.int(5, 120);
  const budget = openedAge * 1440 + NOW_MINUTE - minute;
  const maxStep = Math.max(1, Math.floor(budget / Math.max(1, count)));
  const comments: DemoCaseComment[] = [];
  for (let k = 0; k < count; k++) {
    if (k > 0) minute += rng.int(1, Math.min(maxStep, 2880));
    // The customer writes first and then they alternate (a customer-only thread while unassigned).
    const fromEmployee = assignee !== undefined && k % 2 === 1;
    const contact = customer.contacts[k % customer.contacts.length]!;
    const day = Math.floor(minute / 1440);
    const inDay = minute - day * 1440;
    comments.push(
      Object.freeze({
        id: `${supportCase.id}-cmt-${k + 1}`,
        authorKind: fromEmployee ? ('employee' as const) : ('customer' as const),
        authorId: fromEmployee ? assignee.id : contact.id,
        authorName: fromEmployee ? assignee.fullName : contact.fullName,
        postedAt: `${daysAgo(openedAge - day)}T${pad2(Math.floor(inDay / 60))}:${pad2(inDay % 60)}`,
        text: message(rng, fromEmployee ? AGENT_SENTENCES : CUSTOMER_SENTENCES),
      }),
    );
  }
  return Object.freeze({ ...supportCase, comments: Object.freeze(comments) });
}

const supportCases = createDataset('makeSupportCases', makeSupportCase);
const details = createDataset('getSupportCase', makeSupportCaseDetail);

/**
 * The first `n` support cases (without comments), frozen and cached per `n`. Row `i` is the same for
 * every `n`. Throws on a negative or non-integer `n`.
 */
export const makeSupportCases = (n: number): readonly DemoSupportCase[] => supportCases.make(n);

/** The support case of any well-formed id (`cs-<positive integer>`) with its comments, or `undefined`. */
export function getSupportCase(id: string): DemoSupportCaseDetail | undefined {
  const index = indexFromId(id, 'cs-');
  return index < 0 ? undefined : details.at(index);
}
