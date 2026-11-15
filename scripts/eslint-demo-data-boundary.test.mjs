// #515: library code (packages/*/src, outside stories, tests, showcase/ and internal/demo-data/) may not import
// the demo universe `internal/demo-data`: it would ship fictitious data in the published bundle. Lints source text
// with the repo's real eslint.config.js, at file paths that do not need to exist.
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd });

async function messages(filePath, source, ruleId) {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter((m) => m.ruleId === ruleId).map((m) => m.message);
}
const boundary = (file, source) => messages(file, source, 'no-restricted-syntax');

const IMPORT = "import { makeCustomers } from '../internal/demo-data';\nexport const x = makeCustomers;\n";

// The first lint loads the whole config (typescript-eslint, plugins): seconds, not milliseconds.
describe('lint: library code does not import internal/demo-data (#515)', { timeout: 60_000 }, () => {
  it.each([
    ['core', 'packages/core/src/list-report/ListReport.tsx'],
    ['pro', 'packages/pro/src/list-report/VirtualListReport.tsx'],
    ['core hook', 'packages/core/src/object-page/use-object-page-form.ts'],
    ['pro index', 'packages/pro/src/index.ts'],
  ])('%s: %s is an error', async (_label, file) => {
    const found = await boundary(file, IMPORT);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/CONTRIBUTING\.md, section "Demo data"/);
  });

  it.each([
    ['a deep import', "import { makeCustomers } from '../internal/demo-data/customers';\nexport { makeCustomers };\n"],
    ['a sibling import from internal/', "import { makeCustomers } from './demo-data';\nexport { makeCustomers };\n"],
    ['a re-export', "export { makeCustomers } from '../internal/demo-data';\n"],
    ['export *', "export * from '../internal/demo-data';\n"],
    ['a dynamic import', "export const load = () => import('../internal/demo-data');\n"],
    ['a type import', "import type { DemoCustomer } from '../internal/demo-data';\nexport type X = DemoCustomer;\n"],
  ])('%s is an error', async (_label, source) => {
    expect(await boundary('packages/core/src/internal/Some.tsx', source)).toHaveLength(1);
    expect(await boundary('packages/pro/src/internal/Some.tsx', source)).toHaveLength(1);
  });

  it.each([
    ['core story', 'packages/core/src/list-report/ListReport.stories.tsx'],
    ['pro story', 'packages/pro/src/list-report/VirtualListReport.stories.tsx'],
    ['core test', 'packages/core/src/list-report/ListReport.test.tsx'],
    ['pro test', 'packages/pro/src/list-report/VirtualListReport.test.ts'],
    ['core showcase', 'packages/core/src/showcase/InvoiceCrud.tsx'],
    ['pro showcase', 'packages/pro/src/showcase/invoice-review.tsx'],
    ['the demo universe itself', 'packages/core/src/internal/demo-data/customers.ts'],
  ])('%s is allowed', async (_label, file) => {
    expect(await boundary(file, IMPORT)).toEqual([]);
  });

  it('a library file importing something else under internal/ is not affected', async () => {
    expect(await boundary('packages/core/src/list-report/ListReport.tsx', "import { x } from '../internal/escape-key';\nexport { x };\n")).toEqual([]);
    expect(await boundary('packages/core/src/list-report/ListReport.tsx', "import { x } from '../internal/demo-data-like';\nexport { x };\n")).toEqual([]);
  });

  it('the other rules of the same files keep working (the new rule replaces none of them)', async () => {
    const internalFacade = await messages('packages/core/src/list-report/ListReport.tsx', "import { x } from '../internal';\nexport { x };\n", 'no-restricted-imports');
    expect(internalFacade).toHaveLength(1);
    const showcase = await messages('packages/pro/src/index.ts', "export { STATUS_LABEL } from '../../core/src/showcase/showcase-data';\n", 'no-restricted-imports');
    expect(showcase).toHaveLength(1);
  });

  it('the real library sources pass', async () => {
    const results = await eslint.lintFiles(['packages/core/src', 'packages/pro/src']);
    const found = results.flatMap((r) => r.messages.filter((m) => m.ruleId === 'no-restricted-syntax' && /demo-data/.test(m.message)).map((m) => `${r.filePath}: ${m.message}`));
    expect(found).toEqual([]);
  });

  // The rule already in place for the copy-paste examples keeps banning demo-data (no duplicate message from the new rule).
  it.each([
    'packages/core/src/list-report/Some.example.tsx',
    'packages/pro/src/list-report/Some.example.tsx',
  ])('%s: the example rule still bans demo-data (relative path and internal), the new rule stays out', async (file) => {
    expect(await messages(file, "import { makeCustomers } from '../internal/demo-data';\nexport { makeCustomers };\n", 'no-restricted-imports')).toHaveLength(2);
    expect(await boundary(file, "import { makeCustomers } from '../internal/demo-data';\nexport { makeCustomers };\n")).toEqual([]);
  });
});
