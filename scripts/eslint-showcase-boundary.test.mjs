// #377: the Free CRUD showcase (packages/core/src/showcase, story-only) may be imported from packages/pro only
// inside packages/pro/src/showcase/ (the Pro story and its story-only helpers/tests). Lints source text with
// the repo's real eslint.config.js, at file paths that do not need to exist.
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd });

async function restricted(filePath, source) {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports').map((m) => m.message);
}

// #526: the paths and imports cite the files of the record-editing showcase (the invoice one was removed); same cases.
const CORE_SHOWCASE = "import { RecordCrud } from '../../core/src/showcase/RecordCrud';\nexport { RecordCrud };\n";

// The first lint loads the whole config (typescript-eslint, plugins): seconds, not milliseconds.
describe('lint: the story-only showcase stays out of the Pro package (#377)', { timeout: 60_000 }, () => {
  it.each([
    ['packages/pro/src/index.ts', CORE_SHOWCASE],
    ['packages/pro/src/change-summary/ChangeSummary.tsx', "export { SALES_ORDERS_CRUD } from '../../../core/src/showcase/modules/sales-orders/sales-orders-module';\n"],
    // A Pro story outside src/showcase/ is not allowed either.
    ['packages/pro/src/list-report/Other.stories.tsx', "export { CRUD_ARGS } from '../../../core/src/showcase/sales-order-story-args';\n"],
    // pro's own story-only folder is not reachable from the package code.
    ['packages/pro/src/index.ts', "export { salesOrderSaveReview } from './showcase/sales-order-review';\n"],
    ['packages/pro/test/some.test.ts', "export { RecordCrud } from '../../core/src/showcase/RecordCrud';\n"],
  ])('%s: the import is an error', async (file, source) => {
    const messages = await restricted(file, source);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/story-only/);
  });

  it.each([
    ['packages/pro/src/showcase/RecordEditingIntegrity.stories.tsx', "export { RecordCrud } from '../../../core/src/showcase/RecordCrud';\n"],
    ['packages/pro/src/showcase/sales-order-review.tsx', "export { SALES_ORDERS_CRUD } from '../../../core/src/showcase/modules/sales-orders/sales-orders-module';\n"],
    ['packages/pro/src/showcase/sales-order-review.test.tsx', "export { RecordCrud } from '../../../core/src/showcase/RecordCrud';\n"],
  ])('%s: the import is allowed', async (file, source) => {
    expect(await restricted(file, source)).toEqual([]);
  });

  // #518: the showcase is no longer about invoices only; the message names it for what it is.
  it('the message names the record-editing showcase', async () => {
    const [message] = await restricted('packages/pro/src/index.ts', CORE_SHOWCASE);
    expect(message).toContain('The record-editing showcase (packages/core/src/showcase, packages/pro/src/showcase) is story-only');
  });

  it('the real sources pass: the Pro story imports the showcase, the package does not', async () => {
    const results = await eslint.lintFiles(['packages/pro/src', 'packages/pro/test']);
    const messages = results.flatMap((r) => r.messages.filter((m) => m.ruleId === 'no-restricted-imports'));
    expect(messages).toEqual([]);
  });
});
