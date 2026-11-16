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
 *
 * Each customer message after the opening replies to the employee message before it: an answer to a
 * question, a yes to a proposal, or, when the employee asked nothing, a reminder posted on a later day.
 * The employee asks the case's question at most once and before proposing anything; the resolution
 * is the one proposed, if any; thanks follow something to thank for; the last message of a `resolved`
 * or `closed` case neither promises nor waits, and in a `closed` one the closing sentence comes last.
 * No sentence appears twice in a thread.
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
   * increasing within a case, the first on the day the case was opened (any day of the week), the
   * others Monday to Friday, none after `DEMO_TODAY`.
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

/** The employee's question of a topic, and what the customer answers to it. */
interface Question {
  /** Ends with the question mark: it is the last sentence of the message. */
  readonly ask: string;
  readonly answers: readonly string[];
}

/** A way out of a case: what the employee offers (before a `Is that fine for you?`) and what is done. */
interface Solution {
  readonly propose: string;
  /** Reads as done whether or not it was proposed first. */
  readonly resolve: string;
}

interface Topic {
  readonly subject: string;
  /** What the customer writes to open the case. */
  readonly opening: readonly string[];
  /** Background the customer may add to the opening (never in a later message). */
  readonly context: readonly string[];
  /** The employee's first answer when it is not a question: what they are doing about it. */
  readonly ack: string;
  /** The one thing the employee may need to ask; asked at most once per thread. */
  readonly question: Question;
  /** One of them is picked per thread: the proposal and the resolution always belong together. */
  readonly solutions: readonly Solution[];
}

/** `{sku}` stands for the SKU of the product of the case. */
const TOPICS: readonly Topic[] = [
  {
    subject: 'Wrong quantity delivered for {sku}',
    opening: ['We received fewer units of {sku} than the packing slip says.', 'The quantity of {sku} we received does not match our order.'],
    context: ['Our receiving department counted the boxes on the day they arrived.', 'The order was placed by e-mail last month.', 'The goods are needed for a maintenance stop at our plant.'],
    ack: 'I am comparing the packing slip with the warehouse record for {sku}.',
    question: {
      ask: 'Could you count the boxes of {sku} again and send me a photo of the delivery note?',
      answers: [
        'We counted the boxes of {sku} again and two are missing. The photo of the delivery note is attached.',
        'One box of {sku} is missing after a second count. I have attached the photo of the delivery note.',
      ],
    },
    solutions: [
      { propose: 'I can send the missing units of {sku} as a separate shipment this week.', resolve: 'The missing units of {sku} have been sent as a separate shipment.' },
      { propose: 'I can issue a credit note for the units of {sku} that were not delivered.', resolve: 'I have issued a credit note for the units of {sku} that were not delivered.' },
    ],
  },
  {
    subject: 'Damaged packaging on {sku}',
    opening: ['The cartons of {sku} arrived damaged and some of the items cannot be used.', 'The packaging of {sku} was damaged on delivery.'],
    context: ['The driver noted the damage on the delivery note.', 'The same item arrived without problems in earlier orders.', 'The damaged items are kept in our receiving area.'],
    ack: 'I am sorry about the damaged goods. I have opened a claim with the carrier for {sku}.',
    question: {
      ask: 'Could you send me a photo of the damaged packaging of {sku} and of the label?',
      answers: ['I have attached the photos of the damaged packaging of {sku} and of the label.', 'The photos of the packaging and of the label of {sku} are attached.'],
    },
    solutions: [
      { propose: 'I can ship a replacement for the damaged units of {sku}.', resolve: 'A replacement for the damaged units of {sku} has been shipped.' },
      { propose: 'I can issue a credit note for the damaged units of {sku}.', resolve: 'I have issued a credit note for the damaged units of {sku}.' },
    ],
  },
  {
    subject: 'Certificate of conformity missing for {sku}',
    opening: ['The delivery of {sku} came without the certificate of conformity.', 'Our quality department needs the certificate of conformity for {sku} before the goods can be released.'],
    context: ['The goods are kept in our receiving area until the certificate arrives.', 'The certificate came with earlier deliveries of the same item.', 'We need it before the end of the week.'],
    ack: 'I have asked the supplier of {sku} for the certificate of conformity.',
    question: {
      ask: 'I need the batch number to find the right certificate. Which batch number is printed on the boxes of {sku}?',
      answers: ['The batch number on the boxes of {sku} is L2409-17.', 'All the boxes of {sku} carry the same batch number, L2410-03.'],
    },
    solutions: [
      {
        propose: 'I can ask the supplier for a certificate that covers all the batches of {sku} you have received.',
        resolve: 'The certificate of conformity for {sku}, covering all the batches you have received, is attached to this message.',
      },
      {
        propose: 'I can send the certificate of conformity of {sku} directly to your quality department.',
        resolve: 'The certificate of conformity for {sku} has been sent to your quality department, and a copy is attached to this message.',
      },
    ],
  },
  {
    subject: 'Delivery of {sku} is late',
    opening: ['The delivery of {sku} has not arrived and the promised date has passed.', 'We are still waiting for {sku}, and the promised delivery date was last week.'],
    context: ['The order was placed by e-mail last month.', 'The goods are needed for a maintenance stop at our plant.', 'This affects the planning of our production.'],
    ack: 'I have checked the shipment of {sku} with the warehouse and I am asking the carrier for a new delivery date.',
    question: {
      ask: 'Could you confirm that someone can receive the goods of {sku} at the delivery address on weekdays?',
      answers: [
        'Our receiving department is open on weekdays from 07:00 to 16:00, so the goods of {sku} can be delivered on any working day.',
        'Someone can receive the goods of {sku} on weekdays between 08:00 and 15:00.',
      ],
    },
    solutions: [
      { propose: 'The carrier can deliver {sku} on the next working day, in the morning.', resolve: 'The shipment of {sku} was delivered and the carrier confirmed the receipt.' },
      { propose: 'I can send {sku} again by express courier, at our cost.', resolve: 'The goods of {sku} were sent by express courier and have arrived at your site.' },
    ],
  },
  {
    subject: 'Quotation request for {sku}',
    opening: ['Could you send us a quotation for {sku}, for the quantity we usually order?'],
    context: ['We would like to place the order this month.', 'The delivery address is the one on our account.', 'Please include the delivery time in the quotation.'],
    // Not "preparing the quotation": the quantity and the date it depends on are asked afterwards.
    ack: 'I am checking the stock of {sku} in our warehouses.',
    question: {
      ask: 'Could you tell me the quantity and the delivery date you need for the quotation of {sku}?',
      answers: ['We need 200 units of {sku}, with delivery by the end of next month.', 'We need 50 units of {sku}, with delivery within three weeks.'],
    },
    solutions: [
      {
        propose: 'I can offer {sku} with a volume discount if the order is placed this month.',
        resolve: 'The quotation for {sku}, with a volume discount, is attached to this message, valid for 30 days.',
      },
      {
        propose: 'I can split the delivery of {sku} into two shipments, so that part of it arrives sooner.',
        resolve: 'The quotation for {sku}, with the delivery split into two shipments, is attached to this message.',
      },
    ],
  },
  {
    subject: 'Invoice price of {sku} does not match the quotation',
    opening: ['The price on the invoice for {sku} is higher than the price in your quotation.'],
    context: ['The quotation was sent to us last month.', 'Our accounts department has put the invoice on hold.', 'The other lines of the invoice are correct.'],
    ack: 'I am comparing the invoice with the quotation for {sku}.',
    question: {
      ask: 'Could you send me the number of the quotation you are referring to for {sku}?',
      answers: ['The quotation for {sku} has the number Q-2026-0412.', 'I have attached the quotation for {sku}; its number is in the top right corner.'],
    },
    solutions: [
      { propose: 'I can issue a credit note for the difference in price of {sku}.', resolve: 'You are right about {sku}: I have issued a credit note for the difference in price.' },
      {
        propose: 'I can cancel the invoice and issue a new one with the price of the quotation for {sku}.',
        resolve: 'The invoice has been cancelled, and a new one with the price of the quotation for {sku} is attached to this message.',
      },
    ],
  },
  {
    subject: 'Return request for {sku}',
    opening: ['We would like to return the {sku} we received, it is not what we need.'],
    context: ['We ordered the wrong size by mistake.', 'The goods are stored in our warehouse and ready to be picked up.', 'The order was placed by e-mail last month.'],
    ack: 'I can arrange the return of {sku}; I am checking the return conditions of your order.',
    question: {
      ask: 'Could you confirm the quantity of {sku} you want to return and whether the boxes are unopened?',
      answers: ['We want to return all the units of {sku}, and the boxes are unopened.', 'We want to return half of the units of {sku}; the boxes are still unopened.'],
    },
    solutions: [
      { propose: 'I can send you a return label for {sku}.', resolve: 'The return of {sku} is registered and a return label has been sent to you.' },
      { propose: 'I can have the carrier collect {sku} at your site.', resolve: 'The collection of {sku} is booked with the carrier for your site.' },
    ],
  },
  {
    subject: 'Technical data sheet needed for {sku}',
    opening: ['Please send us the technical data sheet for {sku}.'],
    context: ['Our engineering department needs it to approve the item.', 'The data sheet we have is an older revision.', 'We would like to receive it this week.'],
    ack: 'I am getting the latest technical data sheet for {sku} from the supplier.',
    question: {
      ask: 'Do you need the data sheet of {sku} in a particular language or revision?',
      answers: ['We need the latest revision of the data sheet of {sku}, in English.', 'Any revision of the data sheet of {sku} from this year is fine for us, in English or in German.'],
    },
    solutions: [
      { propose: 'I can also send you the safety data sheet of {sku}.', resolve: 'The technical data sheet and the safety data sheet for {sku} are attached to this message.' },
      {
        propose: 'I can send you the data sheet of {sku} together with the installation instructions.',
        resolve: 'The technical data sheet and the installation instructions for {sku} are attached to this message.',
      },
    ],
  },
  {
    subject: 'Substitute needed for {sku}',
    opening: ['{sku} is no longer available from our usual source, do you have an equivalent?'],
    context: ['We use it in the maintenance of our production lines.', 'We need about the same quantity as in our last order.', 'We would like to order before the end of the month.'],
    ack: 'I am looking for an equivalent of {sku} in our current catalogue.',
    question: {
      ask: 'So that I can propose an equivalent, which dimensions and material of {sku} are essential for you?',
      answers: ['The outer dimensions of {sku} must stay the same; the material can change.', 'The material of {sku} must stay the same; the length can differ by a few millimetres.'],
    },
    solutions: [
      { propose: 'I can offer an equivalent of {sku} from another supplier.', resolve: 'I have added an equivalent of {sku} from another supplier to a quotation for you, attached to this message.' },
      { propose: 'I can send you a sample of an equivalent of {sku} to test.', resolve: 'A sample of an equivalent of {sku} has been shipped to you for testing.' },
    ],
  },
];

// The moves of a conversation. The customer opens, then each customer message answers the employee
// message before it: an answer to a question, a yes to a proposal, or (after a message that asks
// nothing) a reminder, never on the same day. See `planMoves`.
type CustomerMove = 'open' | 'answer' | 'accept' | 'chase';
export type EmployeeMove = 'ack' | 'ask' | 'propose' | 'progress' | 'resolve';

/** What the customer says after each employee move: the employee's message decides it. */
const REPLY_TO: Readonly<Record<Exclude<EmployeeMove, 'resolve'>, CustomerMove>> = {
  ack: 'chase',
  progress: 'chase',
  ask: 'answer',
  propose: 'accept',
};

/** Asked after a proposal: the customer's `accept` answers it. */
const CONFIRM_QUESTIONS: readonly string[] = ['Is that fine for you?', 'Shall I go ahead?', 'Would that work for you?'];
const CUSTOMER_ACCEPT: readonly string[] = ['Yes, please go ahead.', 'That works for us, thank you.', 'Yes, that is fine for us.'];
/** A reminder: the customer's first sentence is a question, posted on a later day than the employee's message. */
const CUSTOMER_CHASE: readonly string[] = [
  'Is there any news on this case?',
  'Could you give us an update today?',
  'When can we expect an answer? This is still open on our side.',
];
/** The employee's update, worded for what the customer just wrote. */
const EMPLOYEE_PROGRESS: Readonly<Record<'answer' | 'accept' | 'chase', readonly string[]>> = {
  answer: [
    'Thank you for the details, I am working on it now.',
    // Not "to go ahead": a later proposal may end with "Shall I go ahead?".
    'Thank you, that is exactly the information I needed.',
    'Thank you for the information, I have passed it to my colleagues.',
  ],
  accept: ['Thank you for the confirmation, I am arranging it now.', 'Thank you, I have started it and will confirm when it is done.'],
  chase: [
    'I am sorry for the wait, I am still working on it.',
    'I have raised the priority of this case with my colleagues.',
    'I am still waiting for an answer from my colleagues and will come back to you.',
  ],
};
/** An employee message posted this many calendar days or more after the one before it says sorry for the wait. */
const LATE_REPLY_DAYS = 7;
const EMPLOYEE_LATE_APOLOGY = 'I apologise for the late reply.';
const EMPLOYEE_CLOSING = 'I am closing this case, please open a new one if you need anything else.';

// Extra sentences that lengthen a message without changing its meaning, by phase; never the same
// sentence twice in a thread.
/** Added to the opening only (with the topic's own `context`). */
const OPENING_DETAILS: readonly string[] = [
  'Please reply to this case rather than by phone.',
  'We have already informed our purchasing manager.',
  'Our customer number is on the documents we received from you.',
  'Thank you in advance for your help.',
];
/** Added to a later customer message (an answer, a yes, a reminder). */
const FOLLOWUP_DETAILS: readonly string[] = [
  'Please reply to this case rather than by phone.',
  'We have already informed our purchasing manager.',
  'A colleague can answer if I am not available.',
  'I am in the office every day this week.',
];
/** While the case is being worked on (an acknowledgement, an update): waiting and taking charge. */
const ONGOING_DETAILS: readonly string[] = [
  'I will follow this case personally until it is solved.',
  'I will write again as soon as I have news.',
  'I have added a note to your account.',
  'I have informed your account manager.',
  'You can reply to this message at any time.',
  'I am available by phone during working hours.',
  'I have checked the history of your orders.',
  'I have asked a colleague to help me with it.',
];
/** Before a question or a proposal (the question stays the last sentence). */
const QUESTION_DETAILS: readonly string[] = [
  'I have added a note to your account.',
  'I have informed your account manager.',
  'I am available by phone during working hours.',
  'I have asked a colleague to help me with it.',
  'I have checked the history of your orders.',
  'I have gone through your message with a colleague.',
  'The service team works from Monday to Friday.',
];
/** After the solution of a `resolved` or `closed` case: nothing still to do, nothing to wait for. */
const CLOSING_DETAILS: readonly string[] = [
  'The solution is recorded in the history of this case.',
  'Your account manager has been informed of the solution.',
  'I have updated the records of your account.',
  'Thank you for contacting us.',
  'A colleague has double-checked the solution.',
  'The service team works from Monday to Friday.',
  'Please keep the case number for your records.',
];
const LONG_CHANCE = 0.08;
const EXTRA_CHANCE = 0.4;
/** A long message adds 5 to 7 sentences, so it needs 7 unused ones in its pool. */
const LONG_EXTRA: readonly [number, number] = [5, 7];

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
const dayStart = (slot: number): number => slot - (slot % SLOTS_PER_DAY);
const TODAY_WEEKDAY = new Date(`${DEMO_TODAY}T00:00:00Z`).getUTCDay();
/** Whether the day `age` days before `DEMO_TODAY` is a Saturday or a Sunday. */
function isWeekend(age: number): boolean {
  const weekday = (((TODAY_WEEKDAY - age) % 7) + 7) % 7;
  return weekday === 0 || weekday === 6;
}

/**
 * The employee's moves of a thread with `employees` employee messages, in order. A move that asks
 * nothing (`ack`, `progress`) is followed by a reminder of the customer on a later day, so there are at
 * most `maxChases` of them before the last message. The question is asked once, before any proposal;
 * there is one proposal at most. A `pending` case keeps its proposal (or its question) for the last
 * message, which waits for the customer; `resolved` and `closed` end with the resolution. Exported for
 * its own test only (not part of the demo-data index).
 */
export function planMoves(rng: Rng, status: DemoSupportCaseStatus, employees: number, maxChases: number): EmployeeMove[] {
  const endsWithEmployee = !LAST_IS_CUSTOMER[status];
  const free = endsWithEmployee ? employees - 1 : employees;
  const moves: EmployeeMove[] = [];
  const options: EmployeeMove[] = [];
  let asked = false;
  let proposed = false;
  let chases = 0;
  // How many more free moves a state still allows: the reminders left, the question, the proposal.
  const room = (a: boolean, p: boolean, c: number): number => maxChases - c + (!a && !p ? 1 : 0) + (!p && status !== 'pending' ? 1 : 0);
  for (let j = 0; j < free; j++) {
    const after = free - j - 1;
    options.length = 0;
    if (chases < maxChases && room(asked, proposed, chases + 1) >= after) options.push(j === 0 ? 'ack' : 'progress');
    if (!asked && !proposed && room(true, false, chases) >= after) options.push('ask');
    if (!proposed && status !== 'pending' && room(asked, true, chases) >= after) options.push('propose');
    // Never empty: `maxChases` is 1 or more (every case but a `new` one is at least a day old, and one
    // opened on a weekend gets a day more), which leaves room for the 3 free moves a thread has at most
    // (`COMMENT_RANGE`); each step keeps one.
    const move = rng.pick(options);
    if (move === 'ask') asked = true;
    else if (move === 'propose') proposed = true;
    else chases++;
    moves.push(move);
  }
  if (endsWithEmployee && employees > 0) {
    if (status !== 'pending') moves.push('resolve');
    else moves.push(!asked && rng.chance(0.5) ? 'ask' : 'propose');
  }
  return moves;
}

/**
 * Distinct, increasing half-hour slots (`SLOTS_PER_DAY` a day, from the day the case was opened) for
 * `count` messages within `total` slots: the first on the opening day, and a message with `newDay[k]`
 * (a reminder, or the first answer to a case opened on a weekend) on a later day than the message
 * before it. Each slot leaves room for the ones after it.
 */
function placeSlots(rng: Rng, newDay: readonly boolean[], total: number): number[] {
  const count = newDay.length;
  const latest: number[] = new Array<number>(count);
  for (let k = count - 1; k >= 0; k--) {
    if (k === count - 1) latest[k] = total - 1;
    else latest[k] = newDay[k + 1] ? dayStart(latest[k + 1]!) - 1 : latest[k + 1]! - 1;
  }
  latest[0] = Math.min(latest[0]!, SLOTS_PER_DAY - 1);
  const slots: number[] = [];
  for (let k = 0; k < count; k++) {
    const previous = slots[k - 1];
    const lo = previous === undefined ? 0 : newDay[k] ? dayStart(previous) + SLOTS_PER_DAY : previous + 1;
    const room = Math.max(0, latest[k]! - lo);
    // The opening anywhere in its day; then about a fair share of the room left, the last message anywhere in it.
    slots.push(lo + rng.int(0, k === 0 ? room : Math.floor((2 * room) / (count - k + 1))));
  }
  return slots;
}

/** One of `pool` not yet in `used` (the first of `pool` if every one is: never the case with these pools). */
function pickFresh(rng: Rng, pool: readonly string[], used: ReadonlySet<string>): string {
  const fresh = pool.filter((sentence) => !used.has(sentence));
  return fresh.length === 0 ? pool[0]! : rng.pick(fresh);
}

/**
 * A message: `main` and some sentences of `details` not used yet in the thread (a partial shuffle: no
 * sentence twice; a thanks last among them), before `main` when it is a question (`mainLast`, so the
 * question ends the message), after it otherwise, then `ending`. Now and then a long one (5 to 7 extra sentences) when the pool has them.
 */
function compose(rng: Rng, used: Set<string>, main: string, details: readonly string[], mainLast: boolean, ending?: string, apology = false): string {
  const pool = details.filter((sentence) => !used.has(sentence));
  const long = rng.chance(LONG_CHANCE) && pool.length >= LONG_EXTRA[1];
  // The apology takes the place of the one short extra sentence, so a short message keeps 3 sentences at most.
  const extra = long ? rng.int(LONG_EXTRA[0], LONG_EXTRA[1]) : pool.length > 0 && rng.chance(EXTRA_CHANCE) && !apology ? 1 : 0;
  const picked: string[] = [];
  for (let i = 0; i < extra; i++) {
    const j = i + rng.int(0, pool.length - 1 - i);
    const sentence = pool[j]!;
    pool[j] = pool[i]!;
    pool[i] = sentence;
    picked.push(sentence);
    used.add(sentence);
  }
  used.add(main);
  // Thanks come last, as people write them ("Thank you in advance...", "Thank you for contacting us.").
  const extras = [...picked.filter((sentence) => !sentence.startsWith('Thank you')), ...picked.filter((sentence) => sentence.startsWith('Thank you'))];
  // A late reply apologises right next to the main sentence (before a question, so that it stays last).
  const parts = mainLast ? [...(apology ? [EMPLOYEE_LATE_APOLOGY] : []), ...extras, main] : [main, ...(apology ? [EMPLOYEE_LATE_APOLOGY] : []), ...extras];
  if (ending !== undefined) parts.push(ending);
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
  // The thread spreads over the opening day and the working days after it (never beyond today): after
  // the opening, nobody writes on a weekend. A case opened on a weekend gets its first answer on a
  // working day, so it needs one more day; with DEMO_TODAY a Thursday, 4 working days follow any weekend.
  const weekendOpening = isWeekend(openedAge);
  const wantedDays = rng.int(weekendOpening ? 2 : 1, MAX_SPAN_DAYS);
  const dayAges = [openedAge];
  for (let age = openedAge - 1; age >= 0 && dayAges.length <= wantedDays; age--) if (!isWeekend(age)) dayAges.push(age);
  const spanDays = dayAges.length - 1;
  const moves = planMoves(rng, supportCase.status, Math.floor(count / 2), spanDays - (weekendOpening ? 1 : 0));
  const solution = rng.pick(topic.solutions);
  // Even positions are the customer's (the opening, then the reply to the employee move before), odd ones the employee's.
  const kinds: (CustomerMove | EmployeeMove)[] = [];
  for (let k = 0; k < count; k++) {
    if (k % 2 === 1) kinds.push(moves[(k - 1) / 2]!);
    else kinds.push(k === 0 ? 'open' : REPLY_TO[moves[k / 2 - 1] as Exclude<EmployeeMove, 'resolve'>]);
  }
  const slots = placeSlots(
    rng,
    kinds.map((kind, k) => kind === 'chase' || (k === 1 && weekendOpening)),
    dayAges.length * SLOTS_PER_DAY,
  );
  const used = new Set<string>();
  const comments: DemoCaseComment[] = [];
  for (let k = 0; k < count; k++) {
    const kind = kinds[k]!;
    const fromCustomer = k % 2 === 0;
    const slot = slots[k]!;
    // An employee reply posted a week or more after the customer's message apologises for it.
    const late = !fromCustomer && dayAges[Math.floor(slots[k - 1]! / SLOTS_PER_DAY)]! - dayAges[Math.floor(slot / SLOTS_PER_DAY)]! >= LATE_REPLY_DAYS;
    let text: string;
    switch (kind) {
      case 'open':
        text = compose(rng, used, rng.pick(topic.opening), [...topic.context, ...OPENING_DETAILS], false);
        break;
      case 'answer':
        text = compose(rng, used, rng.pick(topic.question.answers), FOLLOWUP_DETAILS, false);
        break;
      case 'accept':
        text = compose(rng, used, rng.pick(CUSTOMER_ACCEPT), FOLLOWUP_DETAILS, false);
        break;
      case 'chase':
        text = compose(rng, used, pickFresh(rng, CUSTOMER_CHASE, used), FOLLOWUP_DETAILS, false);
        break;
      case 'ack':
        text = compose(rng, used, topic.ack, ONGOING_DETAILS, false, undefined, late);
        break;
      case 'progress':
        text = compose(rng, used, pickFresh(rng, EMPLOYEE_PROGRESS[kinds[k - 1] as 'answer' | 'accept' | 'chase'], used), ONGOING_DETAILS, false, undefined, late);
        break;
      case 'ask':
        text = compose(rng, used, topic.question.ask, QUESTION_DETAILS, true, undefined, late);
        break;
      case 'propose':
        text = compose(rng, used, `${solution.propose} ${rng.pick(CONFIRM_QUESTIONS)}`, QUESTION_DETAILS, true, undefined, late);
        break;
      case 'resolve':
        text = compose(rng, used, solution.resolve, CLOSING_DETAILS, false, supportCase.status === 'closed' ? EMPLOYEE_CLOSING : undefined, late);
        break;
    }
    const minute = FIRST_MINUTE + (slot % SLOTS_PER_DAY) * SLOT_MINUTES + rng.int(0, SLOT_MINUTES - 1);
    const employee = !fromCustomer && assignee !== undefined;
    comments.push(
      Object.freeze({
        id: `${supportCase.id}-cmt-${k + 1}`,
        authorKind: employee ? ('employee' as const) : ('customer' as const),
        authorId: employee ? assignee.id : contact.id,
        authorName: employee ? assignee.fullName : contact.fullName,
        postedAt: `${daysAgo(dayAges[Math.floor(slot / SLOTS_PER_DAY)]!)}T${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}`,
        text: text.replaceAll('{sku}', sku),
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
