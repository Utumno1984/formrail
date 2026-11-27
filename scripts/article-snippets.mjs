// Checks on the code and the API names of the technical articles (ticket #699), reusable by every article:
// the TypeScript/TSX blocks are compiled with `tsc --noEmit` against the workspace `@formrail/core` (its built declarations),
// and the symbols an article names must exist in the public exports. Pure helpers here, the test is
// `article-snippets.test.mjs`.
//
// Conventions an article follows (so that nothing is skipped by accident):
// - every `<pre><code>` has `class="language-<x>"`: `ts` and `tsx` blocks are compiled, each one as its own module
//   (it carries its imports), the others (`bash`, `json`, `html`, `css`, `text`, `diff`) are not code to compile;
// - an inline `<code class="api">Name</code>` names an export of `@formrail/core` (`packages/core/src/index.ts`);
//   `<code class="api-pro">Name</code>` names one of `@formrail/pro` (`packages/pro/src/index.ts`);
// - a `use...` hook name anywhere in the text is either an export, a React hook, or declared in one of the blocks.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFragment } from 'parse5';
import ts from 'typescript';
import { parseArticle } from './articles.mjs';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const ARTICLES_DIR = path.join(ROOT, 'site-root', 'articles');
export const CORE_INDEX = path.join(ROOT, 'packages', 'core', 'src', 'index.ts');
// The package as a consumer gets it: the workspace link `node_modules/@formrail/core` resolves to its built declarations.
export const CORE_DIST_TYPES = path.join(ROOT, 'packages', 'core', 'dist', 'index.d.ts');
export const PRO_INDEX = path.join(ROOT, 'packages', 'pro', 'src', 'index.ts');
export const PRO_PACKAGE_JSON = path.join(ROOT, 'packages', 'pro', 'package.json');

/** Code languages that are not compiled; any other `language-*` is refused so a typo cannot skip a block. */
export const COMPILED_LANGUAGES = new Set(['ts', 'tsx']);
export const OTHER_LANGUAGES = new Set(['bash', 'sh', 'json', 'html', 'css', 'text', 'diff']);

/** React hooks an article may name without them being in the Formrail exports. */
export const REACT_HOOKS = new Set([
  'useState', 'useEffect', 'useLayoutEffect', 'useRef', 'useMemo', 'useCallback', 'useReducer', 'useContext',
  'useId', 'useTransition', 'useDeferredValue', 'useSyncExternalStore', 'useInsertionEffect', 'useImperativeHandle',
  'useOptimistic', 'useActionState', 'useFormStatus',
]);

/** The article sources (`.html`, dotfiles ignored) of a folder, as { file, source }. A missing folder is none. */
export function articleSources(dir = ARTICLES_DIR) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return names
    .filter((n) => n.endsWith('.html') && !n.startsWith('.'))
    .sort()
    .map((file) => ({ file, source: readFileSync(path.join(dir, file), 'utf8') }));
}

function textOf(node) {
  if (node.nodeName === '#text') return node.value;
  return (node.childNodes ?? []).map(textOf).join('');
}

function walk(node, visit, inPre = false) {
  visit(node, inPre);
  const here = inPre || node.nodeName === 'pre';
  for (const child of node.childNodes ?? []) walk(child, visit, here);
}

const classesOf = (node) => (node.attrs?.find((a) => a.name === 'class')?.value ?? '').split(/\s+/).filter(Boolean);

/**
 * What an article body holds, from the HTML tree (entities decoded, never from the spelling of the source):
 * `blocks` ({ language, code }) of every `<pre><code>`, `inline` ({ api, apiPro } names) of the inline `<code>`,
 * `text` (all visible text, code included) and `links` (every `href`).
 */
export function inspectBody(body) {
  const blocks = [];
  const apiNames = [];
  const proNames = [];
  const links = [];
  const text = [];
  const fragment = parseFragment(body);
  walk(fragment, (node, inPre) => {
    if (node.nodeName === '#text') text.push(node.value);
    for (const attr of node.attrs ?? []) if (attr.name === 'href') links.push(attr.value);
    if (node.nodeName === 'pre') {
      const code = (node.childNodes ?? []).find((c) => c.nodeName === 'code');
      const language = code ? classesOf(code).find((c) => c.startsWith('language-'))?.slice('language-'.length) : undefined;
      blocks.push({ language: language ?? null, code: code ? textOf(code).replace(/\n$/, '') : textOf(node) });
    } else if (node.nodeName === 'code' && !inPre) {
      const classes = classesOf(node);
      if (classes.includes('api')) apiNames.push(textOf(node).trim());
      if (classes.includes('api-pro')) proNames.push(textOf(node).trim());
    }
  });
  return { blocks, api: apiNames, apiPro: proNames, links, text: text.join(' ') };
}

/** Every article of `dir`, parsed with the real article parser (so a malformed one fails here too) and inspected. */
export function inspectArticles(dir = ARTICLES_DIR) {
  return articleSources(dir).map(({ file, source }) => {
    const article = parseArticle(file, source);
    return { file, slug: article.slug, ...inspectBody(article.body) };
  });
}

/** Names exported by an entry file (`export { A, B as C } from`, `export type { T }`, `export const x`). `export *` is refused. */
export function exportedNames(entryFile) {
  const sf = ts.createSourceFile(entryFile, readFileSync(entryFile, 'utf8'), ts.ScriptTarget.Latest, true);
  const names = new Set();
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) {
      if (!st.exportClause) throw new Error(`${entryFile}: "export *" cannot be checked name by name`);
      if (ts.isNamespaceExport(st.exportClause)) names.add(st.exportClause.name.text);
      else for (const el of st.exportClause.elements) names.add(el.name.text);
    } else if (ts.canHaveModifiers(st) && ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) names.add(d.name.text);
      } else if (st.name && ts.isIdentifier(st.name)) {
        names.add(st.name.text);
      }
    }
  }
  return names;
}

/** Subpaths of `@formrail/pro` in its package.json `exports` (`./engine` -> `engine`). */
export function proSubpaths(packageJsonPath = PRO_PACKAGE_JSON) {
  const exportsField = JSON.parse(readFileSync(packageJsonPath, 'utf8')).exports ?? {};
  return new Set(Object.keys(exportsField).filter((k) => k.startsWith('./') && k !== '.').map((k) => k.slice(2)));
}

/** Names declared in the TS/TSX blocks (functions, classes, variables, types): what an article defines itself. */
export function declaredNames(blocks) {
  const names = new Set();
  for (const [i, block] of blocks.entries()) {
    if (!COMPILED_LANGUAGES.has(block.language)) continue;
    const sf = ts.createSourceFile(`block-${i}.tsx`, block.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
      if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) names.add(node.name.text);
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) names.add(node.name.text);
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return names;
}

/** Named imports of the blocks from `@formrail/core` / `@formrail/pro`, as { from, name }. */
export function formrailImports(blocks) {
  const out = [];
  for (const [i, block] of blocks.entries()) {
    if (!COMPILED_LANGUAGES.has(block.language)) continue;
    const sf = ts.createSourceFile(`block-${i}.tsx`, block.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const from = st.moduleSpecifier.text;
      if (from !== '@formrail/core' && from !== '@formrail/pro') continue;
      const bindings = st.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const el of bindings.elements) out.push({ from, name: (el.propertyName ?? el.name).text });
    }
  }
  return out;
}

/**
 * Problems of one inspected article, as readable strings (empty when it is fine): blocks without a known
 * language, API names that are not exports, `use...` names that exist nowhere, `@formrail/pro/<sub>` that is not
 * an export of the Pro package.
 */
export function symbolProblems(inspected, { core = exportedNames(CORE_INDEX), pro = exportedNames(PRO_INDEX), subpaths = proSubpaths() } = {}) {
  const problems = [];
  for (const [i, block] of inspected.blocks.entries()) {
    if (block.language === null) problems.push(`block ${i + 1}: no language class (use class="language-tsx", "language-text", ...)`);
    else if (!COMPILED_LANGUAGES.has(block.language) && !OTHER_LANGUAGES.has(block.language)) problems.push(`block ${i + 1}: unknown language "${block.language}"`);
  }
  for (const name of inspected.api) if (!core.has(name)) problems.push(`<code class="api">${name}</code> is not exported by @formrail/core`);
  for (const name of inspected.apiPro) if (!pro.has(name)) problems.push(`<code class="api-pro">${name}</code> is not exported by @formrail/pro (packages/pro/src/index.ts)`);
  for (const { from, name } of formrailImports(inspected.blocks)) {
    const known = from === '@formrail/core' ? core : pro;
    if (!known.has(name)) problems.push(`a block imports "${name}" from ${from}, which does not export it`);
  }
  const declared = declaredNames(inspected.blocks);
  for (const name of new Set(inspected.text.match(/\buse[A-Z]\w*/g) ?? [])) {
    if (!core.has(name) && !pro.has(name) && !REACT_HOOKS.has(name) && !declared.has(name)) problems.push(`"${name}" looks like a hook but is neither an export, a React hook nor declared in a block`);
  }
  for (const sub of new Set([...inspected.text.matchAll(/@formrail\/pro\/([a-z][\w-]*)/g)].map((m) => m[1]))) {
    if (!subpaths.has(sub)) problems.push(`"@formrail/pro/${sub}" is not an export of the Pro package`);
  }
  return problems;
}

/**
 * Compiles the TS/TSX blocks of the given articles with `tsc --noEmit`, each block as its own module, with
 * `@formrail/core` resolved through the workspace link to the package's built declarations (never a published copy;
 * the build runs before the unit tests in `npm run check`).
 * @returns {{ ok: boolean, output: string, files: string[] }} `output` is tsc's messages (file names are `<slug>-<n>.<ext>`)
 */
export function compileSnippets(articles) {
  const cache = path.join(ROOT, 'node_modules', '.cache');
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(path.join(cache, 'article-snippets-'));
  try {
    const files = [];
    for (const article of articles) {
      for (const [i, block] of article.blocks.entries()) {
        if (!COMPILED_LANGUAGES.has(block.language)) continue;
        const name = `${article.slug}-${i + 1}.${block.language}`;
        // A block with no import/export would be a script, sharing its top-level names with the others.
        const isModule = /^\s*(import|export)\b/m.test(block.code);
        writeFileSync(path.join(dir, name), isModule ? block.code : `${block.code}\nexport {};\n`);
        files.push(name);
      }
    }
    if (files.length === 0) return { ok: true, output: '', files };
    if (!existsSync(CORE_DIST_TYPES)) throw new Error(`${CORE_DIST_TYPES} is missing: build the core first (npm run build)`);
    const tsconfig = {
      extends: path.join(ROOT, 'tsconfig.base.json'),
      compilerOptions: {
        noEmit: true,
        types: [],
        typeRoots: [path.join(ROOT, 'node_modules', '@types')],
      },
      files,
    };
    writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
    const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
    try {
      const output = execFileSync(process.execPath, [tsc, '-p', path.join(dir, 'tsconfig.json'), '--pretty', 'false'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { ok: true, output, files };
    } catch (error) {
      return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}`, files };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
