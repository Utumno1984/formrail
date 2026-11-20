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

  // Ticket #573: the CommonJS forms are banned like the ES ones, with the same message.
  const CJS_BANNED = [
    ['import x = require, bare', "import x = require('../internal/demo-data');\nexport { x };\n"],
    ['import x = require, subpath', "import x = require('../internal/demo-data/customers');\nexport { x };\n"],
    ['import x = require, demo-data as last segment of a longer path', "import x = require('../../internal/demo-data');\nexport { x };\n"],
    ['require, bare', "export const x = require('../internal/demo-data');\n"],
    ['require, subpath', "export const x = require('../internal/demo-data/x');\n"],
    ['require, template literal without interpolation', 'export const x = require(`../internal/demo-data`);\n'],
    ['require, in a nested expression', "export const load = () => ({ x: require('../internal/demo-data/x') });\n"],
  ];
  it.each(CJS_BANNED)('%s is an error, with the message of the guard', async (_label, source) => {
    for (const file of ['packages/core/src/internal/Some.tsx', 'packages/pro/src/internal/Some.tsx']) {
      const found = await boundary(file, source);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(/Library code must not import `internal\/demo-data`.*CONTRIBUTING\.md, section "Demo data"/);
    }
  });

  it.each(CJS_BANNED)('%s is allowed where the ES import is allowed (story, test, showcase, demo-data)', async (_label, source) => {
    for (const file of [
      'packages/core/src/list-report/ListReport.stories.tsx',
      'packages/core/src/list-report/ListReport.test.tsx',
      'packages/core/src/showcase/InvoiceCrud.tsx',
      'packages/core/src/internal/demo-data/customers.ts',
    ]) {
      expect(await boundary(file, source)).toEqual([]);
    }
  });

  it.each([
    ['require of a variable', "declare const name: string;\nexport const x = require(name);\n"],
    ['require of another module', "export const x = require('react');\n"],
    ['require.resolve of demo-data (not a require call, deliberately not banned)', "export const x = require.resolve('../internal/demo-data');\n"],
    ['import x = require of another module', "import x = require('react');\nexport { x };\n"],
    ['import x = require of a name that only contains demo-data', "import x = require('../internal/my-demo-data-utils');\nexport { x };\n"],
    ['require of a name that only contains demo-data', "export const x = require('../internal/my-demo-data-utils');\n"],
    ['import x = Namespace.Member (no module reference)', 'namespace N { export const a = 1; }\nimport x = N.a;\nexport { x };\n'],
    ['a method named require', "declare const loader: { require(s: string): unknown };\nexport const x = loader.require('../internal/demo-data');\n"],
  ])('%s: no error', async (_label, source) => {
    expect(await boundary('packages/core/src/internal/Some.tsx', source)).toEqual([]);
  });

  it.each([
    ['core story', 'packages/core/src/list-report/ListReport.stories.tsx'],
    ['pro story', 'packages/pro/src/list-report/VirtualListReport.stories.tsx'],
    ['core test', 'packages/core/src/list-report/ListReport.test.tsx'],
    ['pro test', 'packages/pro/src/list-report/VirtualListReport.test.ts'],
    ['core showcase', 'packages/core/src/showcase/InvoiceCrud.tsx'],
    ['pro showcase', 'packages/pro/src/showcase/sales-order-review.tsx'],
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
