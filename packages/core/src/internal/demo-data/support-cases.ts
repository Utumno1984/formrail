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

/**
 * A comment on a case, by the customer's contact or by the employee the case is assigned to. A thread
 * follows the conversation: the customer opens, the employee answers, they alternate; the last comment
 * is the customer's while the case is `new` or `open` (it waits for the employee) and the employee's
 * otherwise (`pending` waits for the customer; `resolved` and `closed` end with the solution). One
 * contact of the customer writes the whole thread, and the texts are about the subject of the case.
 */
export interface DemoCaseComment {
  /** Stable id, `<case id>-cmt-<n>`, e.g. `cs-12-cmt-2`. */
  readonly id: string;
  readonly authorKind: 'customer' | 'employee';
  /** A contact of the case's customer (`DemoContact.id`) or the assignee (`DemoEmployee.id`). */
  readonly authorId: string;
  readonly authorName: string;
  /**
   * Local date and time `yyyy-mm-ddThh:mm`, no zone, within working hours (08:00-17:59). Strictly
   * increasing within a case, the first on the day the case was opened, none after `DEMO_TODAY`.
   */
  readonly postedAt: string;
  /** One to three sentences, never the same sentence twice; now and then a long message (6 to 9 sentences) to exercise truncation. */
  readonly text: string;
}

export interface DemoSupportCase {
  /** Stable id, e.g. `cs-12`. */
  readonly id: string;
  /** `CS-<sequence>`, e.g. `CS-10012`. */
  readonly number: string;
  readonly subject: string;
  /** A customer among the first `DEMO_REFERENCE_POOL.customers`; an archived customer only has `closed` cases. */
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
  /** How many comments `getSupportCase(id).comments` has: 0 or 1 for `new`, odd for `open`, even (2 to 8) otherwise. */
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
/** [min, max] comments by status; the parity is fixed by who must write last (see `DemoCaseComment`). */
const COMMENT_RANGE: Readonly<Record<DemoSupportCaseStatus, readonly [number, number]>> = {
  new: [0, 1],
  open: [1, 5],
  pending: [2, 6],
  resolved: [2, 8],
  closed: [2, 8],
};
/** Whether the last comment is the customer's: the case waits for the employee. */
const LAST_IS_CUSTOMER: Readonly<Record<DemoSupportCaseStatus, boolean>> = {
  new: true,
  open: true,
  pending: false,
  resolved: false,
  closed: false,
};

interface Topic {
  readonly subject: string;
  /** What the customer writes to open the case. */
  readonly opening: readonly string[];
  /** The employee's first answer. */
  readonly reply: readonly string[];
  /** What a `pending` case waits for: the employee asks the customer. */
  readonly ask: readonly string[];
  /** The solution a `resolved` or `closed` case ends with. */
  readonly resolve: readonly string[];
}

/** `{sku}` stands for the SKU of the product of the case. */
const TOPICS: readonly Topic[] = [
  {
    subject: 'Wrong quantity delivered for {sku}',
    opening: ['We received fewer units of {sku} than the packing slip says.', 'The quantity of {sku} we received does not match our order.'],
    reply: ['I have compared the packing slip with the warehouse record for {sku} and I can see the difference.'],
    ask: ['Could you count the boxes again and send me a photo of the delivery note for {sku}?'],
    resolve: ['The missing units of {sku} have been sent as a separate shipment.', 'I have issued a credit note for the units of {sku} that were not delivered.'],
  },
  {
    subject: 'Damaged packaging on {sku}',
    opening: ['The cartons of {sku} arrived damaged and some of the items cannot be used.', 'The packaging of {sku} was damaged on delivery.'],
    reply: ['I am sorry about the damaged goods. I have opened a claim with the carrier for {sku}.'],
    ask: ['Could you send a photo of the damaged packaging of {sku} and of the label?'],
    resolve: ['A replacement for the damaged {sku} has been shipped and the carrier claim is closed.', 'I have issued a credit note for the damaged units of {sku}.'],
  },
  {
    subject: 'Certificate of conformity missing for {sku}',
    opening: ['The delivery of {sku} came without the certificate of conformity.', 'Our quality department needs the certificate of conformity for {sku} before the goods can be released.'],
    reply: ['I have asked the supplier of {sku} for the certificate of conformity.'],
    ask: ['Which batch number is printed on the boxes of {sku}? I need it to find the right certificate.'],
    resolve: ['The certificate of conformity for {sku} is attached to this message.'],
  },
  {
    subject: 'Delivery of {sku} is late',
    opening: ['The delivery of {sku} has not arrived and the promised date has passed.', 'We are still waiting for {sku}, and the promised delivery date was last week.'],
    reply: ['I have checked the shipment of {sku} with the warehouse and I am asking the carrier for a new delivery date.'],
    ask: ['Could you confirm that someone can receive the goods of {sku} at the delivery address on weekdays?'],
    resolve: ['The shipment of {sku} was delivered and the carrier confirmed the receipt.', 'The goods of {sku} have arrived at your site and the delay is documented on your account.'],
  },
  {
    subject: 'Quotation request for {sku}',
    opening: ['Could you send us a quotation for {sku}, for the quantity we usually order?'],
    reply: ['I am preparing the quotation for {sku} and I am checking the stock in our warehouses.'],
    ask: ['Could you tell me the quantity and the delivery date you need for the quotation of {sku}?'],
    resolve: ['The quotation for {sku} is attached to this message, valid for 30 days.'],
  },
  {
    subject: 'Invoice price of {sku} does not match the quotation',
    opening: ['The price on the invoice for {sku} is higher than the price in your quotation.'],
    reply: ['I am comparing the invoice with the quotation for {sku}.'],
    ask: ['Could you send me the number of the quotation you are referring to for {sku}?'],
    resolve: ['You are right about {sku}: I have issued a credit note for the difference in price.'],
  },
  {
    subject: 'Return request for {sku}',
    opening: ['We would like to return the {sku} we received, it is not what we need.'],
    reply: ['I can arrange the return of {sku}; I am checking the return conditions of your order.'],
    ask: ['Could you confirm the quantity of {sku} you want to return and whether the boxes are unopened?'],
    resolve: ['The return of {sku} is registered and a return label has been sent to you.', 'The returned {sku} has arrived in our warehouse and a credit note has been issued.'],
  },
  {
    subject: 'Technical data sheet needed for {sku}',
    opening: ['Please send us the technical data sheet for {sku}.'],
    reply: ['I am getting the latest technical data sheet for {sku} from the supplier.'],
    ask: ['Do you need the data sheet of {sku} in a particular language or revision?'],
    resolve: ['The technical data sheet for {sku} is attached to this message.'],
  },
  {
    subject: 'Substitute needed for {sku}',
    opening: ['{sku} is no longer available from our usual source, do you have an equivalent?'],
    reply: ['I am looking for an equivalent of {sku} in our current catalogue.'],
    ask: ['Which dimensions and material of {sku} are essential for you, so that I can propose an equivalent?'],
    resolve: ['I have proposed an equivalent of {sku} and added it to a quotation for you.'],
  },
];

// Phases of a thread that do not depend on the subject.
const CUSTOMER_FOLLOWUP: readonly string[] = [
  'I have attached the photos and the delivery note you asked for.',
  'Here is the information you asked for.',
  'The details are on the label of the box.',
  'Our receiving department confirmed the details.',
];
const CUSTOMER_CHASE: readonly string[] = [
  'Is there any news on this case?',
  'Could you give us an update today?',
  'This is still open on our side and we need an answer this week.',
];
const EMPLOYEE_PROGRESS: readonly string[] = [
  'Thank you for the details, I am working on it with the warehouse team.',
  'I have raised the priority with the warehouse team.',
  'I am waiting for the answer of the supplier and will come back to you.',
  'I have updated the order and the warehouse record.',
];
const EMPLOYEE_CLOSING = 'I am closing this case, please open a new one if you need anything else.';

// Extra sentences that lengthen a message without changing its meaning; never repeated within one.
const CUSTOMER_DETAILS: readonly string[] = [
  'The order was placed by e-mail last month.',
  'The goods are needed for a maintenance stop at our plant.',
  'Our receiving department checked the delivery on the day it arrived.',
  'We have already informed our purchasing manager.',
  'The same item arrived without problems in earlier orders.',
  'Please reply to this case rather than by phone.',
  'The delivery address is the one on our account.',
  'We would like to solve this before the end of the week.',
  'Our quality department is waiting for the answer.',
  'This affects the planning of our production.',
];
const EMPLOYEE_DETAILS: readonly string[] = [
  'I have added a note to your account.',
  'I will follow this case personally until it is solved.',
  'I have informed your account manager.',
  'You can reply to this message at any time.',
  'The service team works from Monday to Friday.',
  'I have checked the history of your orders for similar problems.',
  'The order documents are attached to the case.',
  'I am available by phone during working hours.',
  'I have asked a colleague to double-check the details.',
  'I will write again as soon as I have news.',
];
const LONG_CHANCE = 0.08;
const EXTRA_CHANCE = 0.4;

const SEED = hashSeed('demo-data/support-cases');
const COMMENTS_SEED = hashSeed('demo-data/support-cases/comments');

let sellable: readonly number[] | undefined;
let nonArchived: readonly number[] | undefined;
let customerAge: ((index: number) => number) | undefined;

/** Comments of a case are written in working hours: 20 half-hour slots a day from 08:00. */
const SLOTS_PER_DAY = 20;
const FIRST_MINUTE = 8 * 60;
const SLOT_MINUTES = 30;
const MAX_SPAN_DAYS = 10;

/** `count` with the parity the status needs (an even or odd number of comments, within its range). */
function fixParity(status: DemoSupportCaseStatus, count: number, max: number): number {
  if (status === 'new') return count;
  const wantOdd = LAST_IS_CUSTOMER[status];
  if ((count % 2 === 1) === wantOdd) return count;
  return count + 1 <= max ? count + 1 : count - 1;
}

function makeSupportCase(index: number): DemoSupportCase {
  const customers = makeCustomers(DEMO_REFERENCE_POOL.customers);
  const products = makeProducts(DEMO_REFERENCE_POOL.products);
  if (!sellable) {
    sellable = products.flatMap((product, i) => (product.status === 'draft' ? [] : [i]));
    nonArchived = customers.flatMap((customer, i) => (customer.status === 'archived' ? [] : [i]));
    customerAge = ageCache(customers, (createdOn) => daysBetween(createdOn, DEMO_TODAY));
  }
  const rng = createRowRng(SEED, index);
  const status = rng.weighted(STATUS_WEIGHTS);
  const priority = rng.weighted(PRIORITY_WEIGHTS);
  // An archived account has no open case: only `closed` ones.
  const customerIndex = status === 'closed' ? rng.int(0, customers.length - 1) : nonArchived![rng.int(0, nonArchived!.length - 1)]!;
  const product = products[sellable[rng.int(0, sellable.length - 1)]!]!;
  const [youngest, oldest] = CASE_AGE[status];
  const oldestAllowed = Math.min(oldest, customerAge!(customerIndex));
  const age = rng.int(Math.min(youngest, oldestAllowed), oldestAllowed);
  const [fewest, most] = COMMENT_RANGE[status];
  const commentCount = fixParity(status, rng.int(fewest, most), most);
  // A `new` case may already be assigned; every other one is.
  const assigneeId = status === 'new' && rng.chance(0.75) ? null : pickSupportAgentId(rng);
  const id = `cs-${index + 1}`;
  return Object.freeze({
    id,
    number: `CS-${10001 + index}`,
    subject: rng.pick(TOPICS).subject.replace('{sku}', product.sku),
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

/** `main`, then `extra` distinct sentences of `details` (a partial shuffle: no sentence twice). */
function compose(rng: Rng, main: string, details: readonly string[], extra: number): string {
  const pool = details.slice();
  const parts = [main];
  for (let i = 0; i < extra; i++) {
    const j = i + rng.int(0, pool.length - 1 - i);
    const picked = pool[j]!;
    pool[j] = pool[i]!;
    pool[i] = picked;
    parts.push(picked);
  }
  return parts.join(' ');
}

function productSku(productId: string): string {
  return makeProducts(DEMO_REFERENCE_POOL.products)[indexFromId(productId, 'prd-')]!.sku;
}

function makeSupportCaseDetail(index: number): DemoSupportCaseDetail {
  const supportCase = supportCases.at(index);
  const customer = makeCustomers(DEMO_REFERENCE_POOL.customers)[indexFromId(supportCase.customerId, 'cus-')]!;
  const assignee = supportCase.assigneeId === null ? undefined : getEmployee(supportCase.assigneeId);
  const sku = productSku(supportCase.productId);
  const topic = TOPICS.find((candidate) => candidate.subject.replace('{sku}', sku) === supportCase.subject)!;
  const rng = createRowRng(COMMENTS_SEED, index);
  const openedAge = daysBetween(supportCase.openedOn, DEMO_TODAY);
  const count = supportCase.commentCount;
  // One contact of the customer writes the whole thread.
  const contact = customer.contacts[rng.int(0, customer.contacts.length - 1)]!;
  // Distinct half-hour slots over the first days of the case (never beyond today); the opening comment
  // lands on the day the case was opened.
  const total = (Math.min(openedAge, rng.int(1, MAX_SPAN_DAYS)) + 1) * SLOTS_PER_DAY;
  const slots: number[] = [];
  if (count > 0) {
    slots.push(rng.int(0, Math.min(SLOTS_PER_DAY - 1, total - count)));
    while (slots.length < count) {
      const slot = rng.int(slots[0]! + 1, total - 1);
      if (!slots.includes(slot)) slots.push(slot);
    }
    slots.sort((a, b) => a - b);
  }
  const lastIsCustomer = LAST_IS_CUSTOMER[supportCase.status];
  const comments: DemoCaseComment[] = [];
  for (let k = 0; k < count; k++) {
    const fromCustomer = ((count - 1 - k) % 2 === 0) === lastIsCustomer;
    const last = k === count - 1;
    let main: string;
    if (k === 0) main = rng.pick(topic.opening);
    else if (fromCustomer) main = rng.pick(last ? CUSTOMER_CHASE : CUSTOMER_FOLLOWUP);
    else if (last && supportCase.status === 'pending') main = rng.pick(topic.ask);
    else if (last) main = rng.pick(topic.resolve);
    else main = rng.pick(k === 1 ? topic.reply : EMPLOYEE_PROGRESS);
    if (last && !fromCustomer && supportCase.status === 'closed') main = `${main} ${EMPLOYEE_CLOSING}`;
    const long = rng.chance(LONG_CHANCE);
    const extra = long ? rng.int(5, 7) : rng.chance(EXTRA_CHANCE) ? 1 : 0;
    const slot = slots[k]!;
    const minute = FIRST_MINUTE + (slot % SLOTS_PER_DAY) * SLOT_MINUTES + rng.int(0, SLOT_MINUTES - 1);
    const employee = !fromCustomer && assignee !== undefined;
    comments.push(
      Object.freeze({
        id: `${supportCase.id}-cmt-${k + 1}`,
        authorKind: employee ? ('employee' as const) : ('customer' as const),
        authorId: employee ? assignee.id : contact.id,
        authorName: employee ? assignee.fullName : contact.fullName,
        postedAt: `${daysAgo(openedAge - Math.floor(slot / SLOTS_PER_DAY))}T${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}`,
        text: compose(rng, main.replaceAll('{sku}', sku), fromCustomer ? CUSTOMER_DETAILS : EMPLOYEE_DETAILS, extra),
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
