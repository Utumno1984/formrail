// @vitest-environment node
// Large-n checks collect every violation and assert once (one `expect` per row would dominate the run).
import { DEMO_COMPANY, DEMO_LEGAL_ENTITIES } from './company';
import { DEMO_REFERENCE_POOL } from './dataset';
import { isoToDayNumber } from './dates';
import { makeEmployees, managerIndexOf } from './employees';

const indexOfId = (id: string) => Number(id.slice('emp-'.length)) - 1;

describe('makeEmployees', () => {
  it('row 0 is the CEO, the only employee without a manager', () => {
    const [ceo] = makeEmployees(1);
    expect(ceo!.managerId).toBeNull();
    expect(ceo!.title).toBe('Chief Executive Officer');
    expect(makeEmployees(10_000).filter((employee) => employee.managerId === null)).toHaveLength(1);
  });

  it('every managerId points to an existing, earlier employee and the chain reaches the CEO without loops (n = 10,000)', () => {
    const employees = makeEmployees(10_000);
    const byId = new Map(employees.map((employee) => [employee.id, employee]));
    const problems: string[] = [];
    employees.forEach((employee, index) => {
      if (employee.managerId === null) return;
      const manager = byId.get(employee.managerId);
      if (!manager) return void problems.push(`${employee.id}: unknown manager ${employee.managerId}`);
      if (indexOfId(manager.id) >= index) problems.push(`${employee.id}: manager ${manager.id} is not earlier`);
      const seen = new Set<string>([employee.id]);
      let current: typeof manager | undefined = manager;
      while (current) {
        if (seen.has(current.id)) return void problems.push(`${employee.id}: cycle through ${current.id}`);
        seen.add(current.id);
        current = current.managerId === null ? undefined : byId.get(current.managerId);
      }
      if (!seen.has('emp-1')) problems.push(`${employee.id}: chain does not reach the CEO`);
    });
    expect(problems).toEqual([]);
  });

  it('six direct reports per manager: the tree is arithmetic', () => {
    expect(managerIndexOf(0)).toBe(-1);
    for (let i = 1; i <= 8; i++) expect(managerIndexOf(i)).toBe(0);
    expect(managerIndexOf(9)).toBe(1);
    expect(managerIndexOf(14)).toBe(1);
    expect(managerIndexOf(15)).toBe(2);
  });

  it('members of a team share their manager department, and teams sit with their manager', () => {
    const employees = makeEmployees(3000);
    const problems: string[] = [];
    for (const employee of employees.slice(9)) {
      const manager = employees[indexOfId(employee.managerId!)]!;
      if (manager.department !== 'management' && employee.department !== manager.department) problems.push(`${employee.id}: department`);
      // Below the regional managers (rows 9-56) a team is where its manager is.
      if (indexOfId(manager.id) > 8 && employee.entityId !== manager.entityId) problems.push(`${employee.id}: entity`);
    }
    expect(problems).toEqual([]);
  });

  it('uses only existing entities, and every entity has staff', () => {
    const entityIds = new Set(DEMO_LEGAL_ENTITIES.map((entity) => entity.id));
    const used = new Set(makeEmployees(DEMO_REFERENCE_POOL.employees).map((employee) => employee.entityId));
    expect(used).toEqual(entityIds);
  });

  it('has unique company e-mail addresses (n = 10,000), on the .example domain', () => {
    const emails = makeEmployees(10_000).map((employee) => employee.email);
    expect(new Set(emails).size).toBe(emails.length);
    const pattern = new RegExp(`^[a-z0-9.]+@${DEMO_COMPANY.domain.replace('.', '\\.')}$`);
    expect(emails.filter((email) => !pattern.test(email))).toEqual([]);
  });

  it('has endDate only for inactive employees, after the hire date', () => {
    const problems = makeEmployees(5000).filter((employee) =>
      employee.status === 'inactive'
        ? employee.endDate === null || isoToDayNumber(employee.endDate) <= isoToDayNumber(employee.hireDate)
        : employee.endDate !== null,
    );
    expect(problems).toEqual([]);
    expect(makeEmployees(5000).some((employee) => employee.status === 'inactive')).toBe(true);
  });

  it('keeps the CEO, the department heads and their managers (the first three levels) active', () => {
    expect(makeEmployees(57).filter((employee) => employee.status !== 'active')).toEqual([]);
  });
});
