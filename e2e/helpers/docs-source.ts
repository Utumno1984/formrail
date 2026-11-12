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
 * The tag names React accepts as intrinsic elements (`keyof JSX.IntrinsicElements` of `@types/react`: HTML
 * and SVG). Read from the types, not a regex on the case: a minified wrapper prints as `<y …/>`, lowercase
 * and still not an element.
 */
export function intrinsicElements(repoRoot: string): Set<string> {
  const probe = resolve(repoRoot, '__docs_source_probe__.tsx');
  const text = "import type { JSX } from 'react';\nexport declare const tag: keyof JSX.IntrinsicElements;\n";
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, skipLibCheck: true, noEmit: true, types: [] };
  const host = ts.createCompilerHost(options);
  const { getSourceFile, fileExists, readFile } = host;
  host.getSourceFile = (name, version, ...rest) => (name === probe ? ts.createSourceFile(name, text, version) : getSourceFile.call(host, name, version, ...rest));
  host.fileExists = (name) => name === probe || fileExists.call(host, name);
  host.readFile = (name) => (name === probe ? text : readFile.call(host, name));
  const program = ts.createProgram([probe], options, host);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(probe)!;
  const declaration = source.statements.find(ts.isVariableStatement)!.declarationList.declarations[0]!;
  const type = checker.getTypeAtLocation(declaration);
  const names = new Set((type.isUnion() ? type.types : [type]).filter((t) => t.isStringLiteral()).map((t) => (t as ts.StringLiteralType).value));
  if (!names.has('div') || !names.has('svg')) throw new Error('JSX.IntrinsicElements not readable from @types/react');
  return names;
}

/** What a snippet may use as JSX tags besides its own declarations. */
export interface KnownTags {
  /** Names exported by the public entries ({@link publicExports}). */
  exports: ReadonlySet<string>;
  /** Intrinsic element names ({@link intrinsicElements}). */
  intrinsic: ReadonlySet<string>;
}

/**
 * What is wrong with a "Show code" text that a reader is meant to paste: a relative or internal import, a
 * Storybook artefact (`fn(`, `args`), or a JSX tag that is neither an HTML/SVG element, nor a public export,
 * nor a component declared in the snippet itself (or imported from React). Empty: nothing.
 */
export function auditSnippet(code: string, { exports, intrinsic }: KnownTags): string[] {
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
    const element = tag === root && intrinsic.has(tag);
    if (!element && !exports.has(root) && !declared.has(root)) problems.push(`<${tag}>: not a public export, an HTML/SVG element or a component declared in the snippet`);
  }
  if (/\bfn\(/.test(code)) problems.push('Storybook `fn(`');
  if (/\bargs\b/.test(code)) problems.push('Storybook `args`');
  return problems;
}

/** The text of a file as the page prints it: same lines, no trailing newline. */
const withoutTrailingNewline = (text: string) => text.replace(/\r\n/g, '\n').replace(/\n+$/, '');

/**
 * What is wrong with a "Show code" text that must BE a file on disk (an example's `*.example.tsx`, a
 * showcase's listed source): the file is missing, or the text differs from it (another file's code, or
 * Storybook's synthesized source instead of the file). Compared whole, apart from the final newline.
 */
export function auditAgainstFile(shown: string, onDisk: string | undefined, file: string): string[] {
  if (onDisk === undefined) return [`${file}: no such file on disk`];
  if (withoutTrailingNewline(shown) === withoutTrailingNewline(onDisk)) return [];
  return [`the printed code differs from ${file}`];
}

/** One listed source file of a showcase page, as the page renders it. */
export interface ListedSource {
  /** `aria-label` of the section: the repository path the page claims. */
  label: string;
  /** The section's heading. */
  heading: string;
  /** The "View on GitHub" link. */
  href: string;
  /** The printed code. */
  shown: string;
}

/** What is wrong with a listed source: a path that is not in the repo, a heading or link that disagree with it, or another file's text. */
export function auditListedSource(source: ListedSource, readRepoFile: (path: string) => string | undefined, sourceUrl: (path: string) => string): string[] {
  const problems: string[] = [];
  if (source.heading !== source.label) problems.push(`${source.label}: heading says "${source.heading}"`);
  if (source.href !== sourceUrl(source.label)) problems.push(`${source.label}: link is ${source.href}`);
  problems.push(...auditAgainstFile(source.shown, readRepoFile(source.label), source.label));
  return problems;
}
