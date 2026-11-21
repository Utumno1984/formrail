// Enrolments in the academy's courses: a contact of a customer or an employee of the company takes a
// course. State and progress agree by construction (a completed enrolment is at 100% with a completion
// date and a score; an enrolled one is at 0%; a withdrawn one keeps its partial progress and never
// completes). Never to a draft course, never before the course was published, never before the
// learner existed (account opened, employee hired).
import type { StatusBadgeTone } from '../../status-badge/StatusBadge';
import { makeCourses } from './courses';
import { makeCustomers } from './customers';
import { createDataset, DEMO_REFERENCE_POOL, indexFromId } from './dataset';
import { daysAgo, daysBetween, DEMO_TODAY } from './dates';
import { makeEmployees } from './employees';
import { createRowRng, hashSeed } from './rng';

export type DemoEnrolmentStatus = 'enrolled' | 'in-progress' | 'completed' | 'withdrawn';

export interface DemoLearner {
  readonly kind: 'customer-contact' | 'employee';
  /** A contact of a customer among the first `DEMO_REFERENCE_POOL.customers` (`cus-12-con-1`), or an employee (`emp-7`). */
  readonly id: string;
  readonly name: string;
}

export interface DemoEnrolment {
  /** Stable id, e.g. `enr-12`. */
  readonly id: string;
  /** A published or retired course among the first `DEMO_REFERENCE_POOL.courses` (never a draft). */
  readonly courseId: string;
  readonly learner: DemoLearner;
  /** ISO date, never before the course was published, never after `DEMO_TODAY`. */
  readonly enrolledOn: string;
  readonly status: DemoEnrolmentStatus;
  /** 0 to 100: 0 when `enrolled`, 100 when `completed`, in between when `in-progress`, any below 100 when `withdrawn`. */
  readonly progressPercent: number;
  /** ISO date, on or after `enrolledOn`; only when `completed`, otherwise `null`. */
  readonly completedOn: string | null;
  /** 50 to 100, only when `completed`, otherwise `null`. */
  readonly score: number | null;
}

export const ENROLMENT_STATUS_LABEL: Readonly<Record<DemoEnrolmentStatus, string>> = Object.freeze({
  enrolled: 'Enrolled',
  'in-progress': 'In progress',
  completed: 'Completed',
  withdrawn: 'Withdrawn',
});

export const ENROLMENT_STATUS_TONE: Readonly<Record<DemoEnrolmentStatus, StatusBadgeTone>> = Object.freeze({
  enrolled: 'info',
  'in-progress': 'warning',
  completed: 'success',
  withdrawn: 'neutral',
});

const STATUS_WEIGHTS: readonly (readonly [DemoEnrolmentStatus, number])[] = [
  ['enrolled', 18],
  ['in-progress', 24],
  ['completed', 44],
  ['withdrawn', 14],
];
/** Enrolments older than this are no longer waiting or ongoing: they ended one way or the other. */
const OPEN_MAX_AGE = 120;
/** A retired course takes no new enrolment: its enrolments are old. */
const RETIRED_MIN_AGE = 150;
const EMPLOYEE_SHARE = 0.35;

const SEED = hashSeed('demo-data/enrolments');

interface Prepared {
  /** Course pool indexes that can be enrolled in, with the age in days of their publication. */
  readonly courses: readonly { readonly index: number; readonly id: string; readonly retired: boolean; readonly age: number }[];
  /** Pool indexes of non-archived customers, and the age in days of the account. */
  readonly customers: readonly { readonly index: number; readonly age: number; readonly contacts: readonly { readonly id: string; readonly fullName: string }[] }[];
  /** Pool indexes of active employees, and the days since hire. */
  readonly employees: readonly { readonly index: number; readonly age: number; readonly id: string; readonly fullName: string }[];
}

let prepared: Prepared | undefined;
function prepare(): Prepared {
  if (prepared) return prepared;
  const courses: Prepared['courses'][number][] = [];
  makeCourses(DEMO_REFERENCE_POOL.courses).forEach((course, index) => {
    if (course.status === 'draft') return;
    courses.push({ index, id: course.id, retired: course.status === 'retired', age: daysBetween(course.publishedOn!, DEMO_TODAY) });
  });
  const customers: Prepared['customers'][number][] = [];
  makeCustomers(DEMO_REFERENCE_POOL.customers).forEach((customer, index) => {
    if (customer.status !== 'archived') customers.push({ index, age: daysBetween(customer.createdOn, DEMO_TODAY), contacts: customer.contacts });
  });
  const employees: Prepared['employees'][number][] = [];
  makeEmployees(DEMO_REFERENCE_POOL.employees).forEach((employee, index) => {
    if (employee.status === 'active') employees.push({ index, age: daysBetween(employee.hireDate, DEMO_TODAY), id: employee.id, fullName: employee.fullName });
  });
  return (prepared = { courses, customers, employees });
}

function makeEnrolment(index: number): DemoEnrolment {
  const { courses, customers, employees } = prepare();
  const rng = createRowRng(SEED, index);
  const course = courses[rng.int(0, courses.length - 1)]!;
  let learner: DemoLearner;
  let learnerAge: number;
  if (rng.chance(EMPLOYEE_SHARE)) {
    const entry = employees[rng.int(0, employees.length - 1)]!;
    learner = Object.freeze({ kind: 'employee', id: entry.id, name: entry.fullName });
    learnerAge = entry.age;
  } else {
    const entry = customers[rng.int(0, customers.length - 1)]!;
    const contact = entry.contacts[rng.int(0, entry.contacts.length - 1)]!;
    learner = Object.freeze({ kind: 'customer-contact', id: contact.id, name: contact.fullName });
    learnerAge = entry.age;
  }
  // Youngest and oldest age of the enrolment: after the publication and after the learner existed.
  const oldest = Math.min(course.age, learnerAge);
  const youngest = course.retired ? Math.min(RETIRED_MIN_AGE, oldest) : 0;
  const enrolledAge = rng.int(youngest, oldest);
  let status = rng.weighted(STATUS_WEIGHTS);
  if ((status === 'enrolled' || status === 'in-progress') && enrolledAge > OPEN_MAX_AGE) status = 'completed';
  let progressPercent = 0;
  let completedOn: string | null = null;
  let score: number | null = null;
  if (status === 'in-progress') progressPercent = rng.int(5, 95);
  else if (status === 'withdrawn') progressPercent = rng.chance(0.4) ? 0 : rng.int(5, 80);
  else if (status === 'completed') {
    progressPercent = 100;
    completedOn = daysAgo(enrolledAge - rng.int(0, Math.min(enrolledAge, 60)));
    score = rng.int(50, 100);
  }
  return Object.freeze({
    id: `enr-${index + 1}`,
    courseId: course.id,
    learner,
    enrolledOn: daysAgo(enrolledAge),
    status,
    progressPercent,
    completedOn,
    score,
  });
}

const enrolments = createDataset('makeEnrolments', makeEnrolment);

/**
 * The first `n` enrolments, frozen and cached per `n`. Row `i` is the same for every `n`. Every
 * `courseId` is among `makeCourses(DEMO_REFERENCE_POOL.courses)` and never a draft; a customer
 * learner is a contact of one of the first `DEMO_REFERENCE_POOL.customers`, an employee learner one of
 * the first `DEMO_REFERENCE_POOL.employees`. Throws on a negative or non-integer `n`.
 */
export const makeEnrolments = (n: number): readonly DemoEnrolment[] => enrolments.make(n);

/** The enrolment of any well-formed id (`enr-<positive integer>`), generated on demand, or `undefined`. */
export function getEnrolment(id: string): DemoEnrolment | undefined {
  const index = indexFromId(id, 'enr-');
  return index < 0 ? undefined : enrolments.at(index);
}
