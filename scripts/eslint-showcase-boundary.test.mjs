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

const CORE_SHOWCASE = "import { InvoiceCrud } from '../../core/src/showcase/InvoiceCrud';\nexport { InvoiceCrud };\n";

// The first lint loads the whole config (typescript-eslint, plugins): seconds, not milliseconds.
describe('lint: the story-only showcase stays out of the Pro package (#377)', { timeout: 60_000 }, () => {
  it.each([
    ['packages/pro/src/index.ts', CORE_SHOWCASE],
    ['packages/pro/src/change-summary/ChangeSummary.tsx', "export { STATUS_LABEL } from '../../../core/src/showcase/showcase-data';\n"],
    // A Pro story outside src/showcase/ is not allowed either.
    ['packages/pro/src/list-report/Other.stories.tsx', "export { CRUD_ARGS } from '../../../core/src/showcase/crud-story-args';\n"],
    // pro's own story-only folder is not reachable from the package code.
    ['packages/pro/src/index.ts', "export { invoiceSaveReview } from './showcase/invoice-review';\n"],
    ['packages/pro/test/some.test.ts', "export { InvoiceCrud } from '../../core/src/showcase/InvoiceCrud';\n"],
  ])('%s: the import is an error', async (file, source) => {
    const messages = await restricted(file, source);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/story-only/);
  });

  it.each([
    ['packages/pro/src/showcase/InvoicesChangeSummary.stories.tsx', "export { InvoiceCrud } from '../../../core/src/showcase/InvoiceCrud';\n"],
    ['packages/pro/src/showcase/invoice-review.tsx', "export { STATUS_LABEL } from '../../../core/src/showcase/showcase-data';\n"],
    ['packages/pro/src/showcase/invoice-review.test.tsx', "export { InvoiceCrud } from '../../../core/src/showcase/InvoiceCrud';\n"],
  ])('%s: the import is allowed', async (file, source) => {
    expect(await restricted(file, source)).toEqual([]);
  });

  it('the real sources pass: the Pro story imports the showcase, the package does not', async () => {
    const results = await eslint.lintFiles(['packages/pro/src', 'packages/pro/test']);
    const messages = results.flatMap((r) => r.messages.filter((m) => m.ruleId === 'no-restricted-imports'));
    expect(messages).toEqual([]);
  });
});
