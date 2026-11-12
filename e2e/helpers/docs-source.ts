import { resolve } from 'node:path';
import ts from 'typescript';

// The copy-paste guard of the Docs pages (ticket #403): pure audit of the first "Show code" of a page, and
// the Node side that reads the public API. Used by e2e/docs-source.spec.ts, which feeds it what the built
// Storybook prints.

/** The names exported by the public entries (`packages/core/src/index.ts`, `packages/pro/src/index.ts`). */
export function publicExports(repoRoot: string): Set<string> {
  const entries = ['packages/core/src/index.ts', 'packages/pro/src/index.ts'].map((p) => resolve(repoRoot, p));
  const program = ts.createProgram(entries, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    skipLibCheck: true,
    noEmit: true,
    // Pro re-exports from the core by name: resolved to the sources, not to a `dist` that may be stale.
    paths: { '@formrail/core': [entries[0]!], '@formrail/pro': [entries[1]!] },
  });
  const checker = program.getTypeChecker();
  const names = new Set<string>();
  for (const entry of entries) {
    const source = program.getSourceFile(entry);
    const symbol = source && checker.getSymbolAtLocation(source);
    if (!symbol) throw new Error(`${entry}: not a module the checker can read`);
    for (const exported of checker.getExportsOfModule(symbol)) names.add(exported.name);
  }
  return names;
}

/**
 * What is wrong with a "Show code" text that a reader is meant to paste: a relative or internal import, a
 * Storybook artefact (`fn(`, `args`), or a JSX tag that is neither an HTML element, nor a public export,
 * nor a component declared in the snippet itself (or imported from React). Empty: nothing.
 */
export function auditSnippet(code: string, exports: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const file = ts.createSourceFile('snippet.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declared = new Set<string>();
  const tags: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const from = node.moduleSpecifier.text;
      if (from.startsWith('.')) problems.push(`relative import "${from}"`);
      if (/(^|\/)internal(\/|$)/.test(from)) problems.push(`internal import "${from}"`);
      if (/^(storybook|@storybook)(\/|$)/.test(from)) problems.push(`Storybook import "${from}"`);
      const bindings = node.importClause?.namedBindings;
      // `<Fragment>`, `<StrictMode>`, `<Suspense>`: React's own components are fine in a snippet.
      if (from === 'react' && bindings && ts.isNamedImports(bindings)) for (const e of bindings.elements) declared.add(e.name.text);
    }
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) declared.add(node.name.text);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declared.add(node.name.text);
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) tags.push(node.tagName.getText(file));
    ts.forEachChild(node, visit);
  };
  visit(file);
  for (const tag of new Set(tags)) {
    const root = tag.split('.')[0]!;
    const html = tag === root && /^[a-z]/.test(tag);
    if (!html && !exports.has(root) && !declared.has(root)) problems.push(`<${tag}>: not a public export, an HTML element or a component declared in the snippet`);
  }
  if (/\bfn\(/.test(code)) problems.push('Storybook `fn(`');
  if (/\bargs\b/.test(code)) problems.push('Storybook `args`');
  return problems;
}
