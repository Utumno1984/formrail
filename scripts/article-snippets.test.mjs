// #699: the code and the API names of the technical articles are checked, for every article in `site-root/articles/`.
// The first describe runs the checks on the real articles (what a new article must satisfy); the others prove, on
// small fixtures, that each check can fail (a check that cannot fail would let a wrong snippet through).
import { describe, expect, it } from 'vitest';
import {
  compileSnippets,
  declaredNames,
  exportedNames,
  inspectArticles,
  inspectBody,
  CORE_INDEX,
  PRO_INDEX,
  proSubpaths,
  symbolProblems,
} from './article-snippets.mjs';

const CORE = new Set(['useObjectPageForm', 'Input']);
const PRO = new Set(['useChangeSummary']);
const SUBPATHS = new Set(['engine', 'react-hook-form']);
const problems = (body) => symbolProblems(inspectBody(body), { core: CORE, pro: PRO, subpaths: SUBPATHS });
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const block = (language, code) => `<pre><code class="language-${language}">${esc(code)}</code></pre>`;
const articleOf = (slug, body) => ({ slug, ...inspectBody(body) });

// tsc loads the sources of the core: seconds, not milliseconds.
const SLOW = 180_000;

describe('the real articles (site-root/articles/)', () => {
  const articles = inspectArticles();

  it('every TS/TSX block compiles with tsc --noEmit against @formrail/core of the workspace', { timeout: SLOW }, () => {
    const result = compileSnippets(articles);
    expect(result.output, result.output).toBe('');
    expect(result.ok).toBe(true);
  });

  it.each(articles.map((a) => [a.file, a]))('%s: every API name, import, hook and Pro subpath it cites exists; every block has a known language', (_file, article) => {
    expect(symbolProblems(article)).toEqual([]);
  });

  it.each(articles.map((a) => [a.file, a]))('%s: names at least one API symbol and has a compiled block (an article about the library shows it)', (_file, article) => {
    expect(article.api.length).toBeGreaterThan(0);
    expect(article.blocks.some((b) => b.language === 'ts' || b.language === 'tsx')).toBe(true);
  });
});

describe('the exports it is checked against', () => {
  it('reads the public entry of the core and of the Pro package, values and types', () => {
    const core = exportedNames(CORE_INDEX);
    for (const name of ['useObjectPageForm', 'UseObjectPageFormOptions', 'Input', 'Field']) expect(core.has(name), name).toBe(true);
    expect(core.has('useNoSuchThing')).toBe(false);
    const pro = exportedNames(PRO_INDEX);
    for (const name of ['useChangeSummary', 'useFormRebase', 'ChangeSummary']) expect(pro.has(name), name).toBe(true);
    // The two form-library adapters are subpaths of the package, not exports of its main entry.
    expect(pro.has('useReactHookFormBinding')).toBe(false);
  });

  it('knows the subpaths of the Pro package', () => {
    const subpaths = proSubpaths();
    for (const sub of ['engine', 'react-hook-form', 'tanstack-form']) expect(subpaths.has(sub), sub).toBe(true);
  });
});

describe('inspectBody', () => {
  it('returns the decoded code of each block with its language, the inline API names and the links', () => {
    const found = inspectBody(
      `<p>See <code class="api">Input</code>, <code>plain</code> and <code class="api-pro">useChangeSummary</code>: <a href="../../storybook/?path=/story/x--y">story</a>.</p>${block('tsx', 'const a: Array<string> = [];\nconst b = 1 && 2;')}${block('bash', 'npm i')}`,
    );
    expect(found.blocks).toEqual([
      { language: 'tsx', code: 'const a: Array<string> = [];\nconst b = 1 && 2;' },
      { language: 'bash', code: 'npm i' },
    ]);
    expect(found.api).toEqual(['Input']);
    expect(found.apiPro).toEqual(['useChangeSummary']);
    expect(found.links).toEqual(['../../storybook/?path=/story/x--y']);
  });

  it('does not take the code of a block for an inline name', () => {
    expect(inspectBody('<pre><code class="language-ts">x</code></pre>').api).toEqual([]);
  });
});

describe('symbolProblems', () => {
  it('accepts exports, React hooks, hooks the blocks declare and Pro subpaths that exist', () => {
    expect(
      problems(
        `<p><code class="api">Input</code> <code class="api">useObjectPageForm</code> <code class="api-pro">useChangeSummary</code> useState useMyForm @formrail/pro/engine</p>${block('ts', 'export function useMyForm() {}')}`,
      ),
    ).toEqual([]);
  });

  it('flags an API name that is not exported (and one only Pro exports, cited as core)', () => {
    expect(problems(`<p><code class="api">NoSuchThing</code></p>`)).toEqual([`<code class="api">NoSuchThing</code> is not exported by @formrail/core`]);
    expect(problems(`<p><code class="api">useChangeSummary</code></p>`)).toEqual([`<code class="api">useChangeSummary</code> is not exported by @formrail/core`]);
    expect(problems('<p><code class="api-pro">Input</code></p>')).toHaveLength(1);
  });

  it('flags an import of a name the package does not export', () => {
    const found = problems(block('ts', "import { useObjectPageForm, nope } from '@formrail/core';"));
    expect(found).toEqual(['a block imports "nope" from @formrail/core, which does not export it']);
  });

  it('flags a hook-like name that exists nowhere, in prose or in code', () => {
    expect(problems('<p>Call useInventedHook now.</p>')).toHaveLength(1);
    expect(problems(block('ts', 'useInventedHook();'))).toHaveLength(1);
  });

  it('flags a Pro subpath that the package does not export', () => {
    expect(problems('<p>@formrail/pro/engine and @formrail/pro/nope</p>')).toEqual(['"@formrail/pro/nope" is not an export of the Pro package']);
  });

  it('flags a block with no language, or one that is not known (a typo would skip the compilation)', () => {
    expect(problems('<pre><code>x</code></pre>')).toHaveLength(1);
    expect(problems(block('tsxx', 'x'))).toHaveLength(1);
    expect(problems(block('text', 'x'))).toEqual([]);
  });
});

describe('declaredNames', () => {
  it('collects functions, constants, interfaces and types of the compiled blocks only', () => {
    const { blocks } = inspectBody(`${block('tsx', 'interface A {}\ntype B = 1;\nconst c = 1;\nfunction d() {}\nclass E {}')}${block('text', 'function ignored() {}')}`);
    expect([...declaredNames(blocks)].sort()).toEqual(['A', 'B', 'E', 'c', 'd']);
  });
});

describe('compileSnippets', () => {
  it('compiles blocks that are valid against the real core, each as its own module (no import: still a module)', { timeout: SLOW }, () => {
    const result = compileSnippets([
      articleOf(
        'ok',
        block('tsx', "import { Input, useObjectPageForm } from '@formrail/core';\nexport function A() {\n  const form = useObjectPageForm({ baseline: { name: '' } });\n  return <Input value={form.values.name} onChange={(e) => form.setValue('name', e.target.value)} />;\n}") +
          block('ts', 'const same = 1;') +
          block('ts', 'const same = 2;'),
      ),
    ]);
    expect(result.output).toBe('');
    expect(result.ok).toBe(true);
    expect(result.files).toEqual(['ok-1.tsx', 'ok-2.ts', 'ok-3.ts']);
  });

  it('fails, naming the block, on a prop the component does not have, a wrong field name and an unknown import', { timeout: SLOW }, () => {
    const result = compileSnippets([
      articleOf(
        'bad',
        block('tsx', "import { Input } from '@formrail/core';\nexport const A = () => <Input valeu=\"x\" />;") +
          block('tsx', "import { useObjectPageForm } from '@formrail/core';\nexport function B() {\n  const form = useObjectPageForm({ baseline: { name: '' } });\n  form.setValue('nope', 'x');\n  return null;\n}") +
          block('ts', "import { noSuchExport } from '@formrail/core';\nexport const c = noSuchExport;"),
      ),
    ]);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('bad-1.tsx');
    expect(result.output).toContain('bad-2.tsx');
    expect(result.output).toContain('bad-3.ts');
  });

  it('compiles nothing, and passes, when no block is TypeScript', () => {
    expect(compileSnippets([articleOf('none', block('bash', 'npm i'))])).toEqual({ ok: true, output: '', files: [] });
  });
});
