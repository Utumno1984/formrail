// Employees of the demo company: an org chart (CEO, department heads, managers, teams) spread over
// the group's entities. The tree is arithmetic, so row `i` (and its manager) never depends on `n`:
// row 0 is the CEO, rows 1-8 the heads of the eight departments, and every later row reports to an
// earlier one (six direct reports per manager), so `managerId` always points back and never loops.
import type { StatusBadgeTone } from '../../status-badge/StatusBadge';
import { DEMO_COMPANY, DEMO_LEGAL_ENTITIES } from './company';
import { createDataset, DEMO_REFERENCE_POOL, indexFromId } from './dataset';
import { daysAgo } from './dates';
import type { DemoLanguageArea } from './geo';
import { personName, PERSON_NAME_SLOTS } from './people';
import { createPermutation, createRowRng, hashSeed, type Rng } from './rng';

export type DemoDepartment =
  | 'management'
  | 'sales'
  | 'customer-service'
  | 'procurement'
  | 'logistics'
  | 'finance'
  | 'it'
  | 'hr'
  | 'marketing';

export type DemoEmployeeStatus = 'active' | 'on-leave' | 'inactive';

export interface DemoEmployee {
  /** Stable id: `emp-1` is the CEO. */
  readonly id: string;
  /** Personnel number, e.g. `E-1001`. */
  readonly code: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  /** `<first>.<last>@<company domain>` (`.example`), unique. */
  readonly email: string;
  readonly title: string;
  readonly department: DemoDepartment;
  /** The group entity the employee works for (`DEMO_LEGAL_ENTITIES`). */
  readonly entityId: string;
  /** The line manager; `null` only for the CEO. Always an earlier employee. */
  readonly managerId: string | null;
  readonly status: DemoEmployeeStatus;
  /** ISO date, before `DEMO_TODAY`. */
  readonly hireDate: string;
  /** ISO date the employee left (only when `inactive`), otherwise `null`. */
  readonly endDate: string | null;
}

export const DEPARTMENT_LABEL: Readonly<Record<DemoDepartment, string>> = Object.freeze({
  management: 'Management',
  sales: 'Sales',
  'customer-service': 'Customer service',
  procurement: 'Procurement',
  logistics: 'Logistics',
  finance: 'Finance',
  it: 'IT',
  hr: 'People & HR',
  marketing: 'Marketing',
});

export const EMPLOYEE_STATUS_LABEL: Readonly<Record<DemoEmployeeStatus, string>> = Object.freeze({
  active: 'Active',
  'on-leave': 'On leave',
  inactive: 'Inactive',
});

export const EMPLOYEE_STATUS_TONE: Readonly<Record<DemoEmployeeStatus, StatusBadgeTone>> = Object.freeze({
  active: 'success',
  'on-leave': 'warning',
  inactive: 'neutral',
});

/** The eight departments under the CEO, in the order of rows 1-8. */
const DEPARTMENTS: readonly Exclude<DemoDepartment, 'management'>[] = [
  'sales',
  'customer-service',
  'procurement',
  'logistics',
  'finance',
  'it',
  'hr',
  'marketing',
];
const REPORTS_PER_MANAGER = 6;
const FIRST_TEAM_ROW = DEPARTMENTS.length + 1;

/** Titles by department: [head, manager, senior / lead, [team member titles]]. */
const TITLES: Readonly<Record<Exclude<DemoDepartment, 'management'>, readonly [string, string, string, readonly string[]]>> = {
  sales: ['Head of Sales', 'Regional Sales Manager', 'Key Account Manager', ['Account Manager', 'Inside Sales Representative', 'Sales Engineer']],
  'customer-service': ['Head of Customer Service', 'Customer Service Manager', 'Customer Service Team Lead', ['Customer Service Agent', 'Order Desk Specialist']],
  procurement: ['Head of Procurement', 'Category Manager', 'Senior Buyer', ['Buyer', 'Purchasing Assistant']],
  logistics: ['Head of Logistics', 'Warehouse Manager', 'Shift Supervisor', ['Warehouse Operative', 'Forklift Operator', 'Logistics Coordinator']],
  finance: ['Chief Financial Officer', 'Finance Manager', 'Senior Accountant', ['Accountant', 'Credit Controller', 'Accounts Payable Clerk']],
  it: ['Chief Information Officer', 'IT Manager', 'Senior Systems Engineer', ['Systems Engineer', 'Support Technician', 'Software Developer']],
  hr: ['Head of People', 'HR Business Partner', 'HR Specialist', ['HR Coordinator', 'Recruiter', 'Payroll Specialist']],
  marketing: ['Head of Marketing', 'Marketing Manager', 'Product Marketing Manager', ['Marketing Coordinator', 'Content Specialist', 'E-commerce Specialist']],
};

/** Name areas of the staff of each entity (a multinational: mostly local, some from elsewhere). */
const STAFF_AREAS: Readonly<Record<string, readonly (readonly [DemoLanguageArea, number])[]>> = {
  'ent-nl': [['nl', 5], ['en', 2], ['de', 1], ['fr', 1], ['es', 1], ['it', 1], ['nordic', 1], ['pl', 1]],
  'ent-us': [['en', 9], ['es', 1]],
  'ent-gb': [['en', 8], ['pl', 1], ['it', 1]],
  'ent-de': [['de', 8], ['pl', 1], ['nl', 1]],
  'ent-jp': [['ja', 9], ['en', 1]],
};

/** The manager row of row `index` (`-1` for the CEO). */
export function managerIndexOf(index: number): number {
  if (index === 0) return -1;
  if (index < FIRST_TEAM_ROW) return 0;
  return 1 + Math.floor((index - FIRST_TEAM_ROW) / REPORTS_PER_MANAGER);
}

/** Depth in the org chart: 0 for the CEO, 1 for the department heads, ... */
function depthOf(index: number): number {
  let depth = 0;
  for (let i = index; i > 0; i = managerIndexOf(i)) depth++;
  return depth;
}

function departmentOf(index: number): DemoDepartment {
  if (index === 0) return 'management';
  let i = index;
  while (i >= FIRST_TEAM_ROW) i = managerIndexOf(i);
  return DEPARTMENTS[i - 1]!;
}

/** Heads sit at the headquarters; each head's six managers cover every entity; teams sit with their manager. */
function entityOf(index: number, depth: number): string {
  if (depth <= 1) return DEMO_COMPANY.headquarters.id;
  if (depth === 2) return DEMO_LEGAL_ENTITIES[((index - FIRST_TEAM_ROW) % REPORTS_PER_MANAGER) % DEMO_LEGAL_ENTITIES.length]!.id;
  let i = index;
  while (depthOf(i) > 2) i = managerIndexOf(i);
  return entityOf(i, 2);
}

const SEED = hashSeed('demo-data/employees');
const NAME_PERMUTATIONS = Object.fromEntries(
  (['en', 'de', 'nl', 'fr', 'es', 'it', 'nordic', 'pl', 'ja'] as const).map((area) => [
    area,
    createPermutation(PERSON_NAME_SLOTS, `demo-data/employees/${area}`),
  ]),
) as Record<DemoLanguageArea, (index: number) => number>;

const STATUS_WEIGHTS: readonly (readonly [DemoEmployeeStatus, number])[] = [
  ['active', 86],
  ['on-leave', 5],
  ['inactive', 9],
];

function status(rng: Rng, depth: number): DemoEmployeeStatus {
  if (depth <= 2) return 'active';
  return rng.weighted(STATUS_WEIGHTS);
}

function makeEmployee(index: number): DemoEmployee {
  const rng = createRowRng(SEED, index);
  const depth = depthOf(index);
  const department = departmentOf(index);
  const entityId = entityOf(index, depth);
  const area = rng.weighted(STAFF_AREAS[entityId]!);
  const person = personName(area, NAME_PERMUTATIONS[area](index));
  let title: string;
  if (department === 'management') title = 'Chief Executive Officer';
  else {
    const titles = TITLES[department];
    title = depth === 1 ? titles[0] : depth === 2 ? titles[1] : depth === 3 ? titles[2] : rng.pick(titles[3]);
  }
  const employeeStatus = status(rng, depth);
  // Seniors were hired earlier; whoever left had been there at least two months.
  const hiredDaysAgo = depth === 0 ? rng.int(4000, 7300) : rng.int(employeeStatus === 'inactive' ? 90 : 20, depth <= 2 ? 6500 : 4500);
  const manager = managerIndexOf(index);
  // Below the name-slot count every person name is unique; past it a namesake may exist, so the
  // e-mail address carries the personnel number to stay unique.
  const local = index < PERSON_NAME_SLOTS ? person.emailLocal : `${person.emailLocal}.${1001 + index}`;
  return Object.freeze({
    id: `emp-${index + 1}`,
    code: `E-${1001 + index}`,
    firstName: person.firstName,
    lastName: person.lastName,
    fullName: person.fullName,
    email: `${local}@${DEMO_COMPANY.domain}`,
    title,
    department,
    entityId,
    managerId: manager < 0 ? null : `emp-${manager + 1}`,
    status: employeeStatus,
    hireDate: daysAgo(hiredDaysAgo),
    endDate: employeeStatus === 'inactive' ? daysAgo(rng.int(1, Math.min(hiredDaysAgo - 60, 900))) : null,
  });
}

const employees = createDataset('makeEmployees', makeEmployee);

/**
 * The first `n` employees, frozen and cached per `n` (`makeEmployees(1)` is the CEO alone). Row `i`
 * is the same for every `n`. Throws on a negative or non-integer `n`.
 */
export const makeEmployees = (n: number): readonly DemoEmployee[] => employees.make(n);

/**
 * The employee of any well-formed id (`emp-<positive integer>`), generated on demand, or `undefined`
 * for a malformed id. Every well-formed id resolves, also beyond the rows a story loaded: so
 * `get…(id) !== undefined` does not prove that a reference points into a generated list; for
 * referential integrity check membership in `makeEmployees(n)` (or in its reference pool) instead.
 */
export function getEmployee(id: string): DemoEmployee | undefined {
  const index = indexFromId(id, 'emp-');
  return index < 0 ? undefined : employees.at(index);
}

let poolIndex: { sales: Map<string, number[]>; buyers: number[]; agents: number[] } | undefined;

/** Sales staff (by entity) and buyers among the first `DEMO_REFERENCE_POOL.employees` employees. */
function referencePool(): { sales: Map<string, number[]>; buyers: number[]; agents: number[] } {
  if (!poolIndex) {
    const sales = new Map<string, number[]>(DEMO_LEGAL_ENTITIES.map((entity) => [entity.id, []]));
    const buyers: number[] = [];
    const agents: number[] = [];
    for (let i = 0; i < DEMO_REFERENCE_POOL.employees; i++) {
      const depth = depthOf(i);
      if (depth < 2) continue;
      const department = departmentOf(i);
      if (department === 'sales') sales.get(entityOf(i, depth))!.push(i);
      else if (department === 'procurement') buyers.push(i);
      else if (department === 'customer-service' && employees.at(i).status !== 'inactive') agents.push(i);
    }
    poolIndex = { sales, buyers, agents };
  }
  return poolIndex;
}

/**
 * An account manager for a customer served by `entityId`: a sales employee (manager level or below)
 * of that entity, among the first `DEMO_REFERENCE_POOL.employees` rows. May be `inactive` (someone
 * who left the company and still owns accounts, as in real data).
 */
export function pickAccountManagerId(rng: Rng, entityId: string): string {
  const candidates = referencePool().sales.get(entityId);
  if (!candidates || candidates.length === 0) throw new Error(`No sales employee in the reference pool for ${entityId}`);
  return `emp-${rng.pick(candidates) + 1}`;
}

/** A buyer (procurement, manager level or below) among the first `DEMO_REFERENCE_POOL.employees` rows. */
export function pickBuyerId(rng: Rng): string {
  return `emp-${rng.pick(referencePool().buyers) + 1}`;
}

/**
 * A customer service employee (manager level or below, never one who has left) among the first
 * `DEMO_REFERENCE_POOL.employees` rows: who a support case is assigned to.
 */
export function pickSupportAgentId(rng: Rng): string {
  return `emp-${rng.pick(referencePool().agents) + 1}`;
}
