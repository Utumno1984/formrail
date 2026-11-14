// Static import graph of a TypeScript source tree (ticket #489): every module specifier a file names, by any
// syntax (`import`, `import type`, `export ... from`, `import('x')` in code or in a type, `require('x')`,
// `/// <reference types="x" />`), followed through the relative ones. Used by the boundary guard of the
// `@formrail/pro/engine` entry, which must reach no `@formrail/core` module, not even for a type.
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

export interface GraphHost {
  /** Source of `path`, or `undefined` when there is no such file. */
  read: (path: string) => string | undefined;
}

export interface ImportEdge {
  /** File that names the module. */
  from: string;
  /** The specifier as written. */
  specifier: string;
}

const isStringLiteral = (node: ts.Node | undefined): node is ts.StringLiteralLike =>
  node !== undefined && ts.isStringLiteralLike(node);

/** Every module specifier named in `source`. */
export function moduleSpecifiers(source: string, fileName: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = file.typeReferenceDirectives.map((ref) => ref.fileName);
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && isStringLiteral(node.moduleSpecifier)) {
      found.push(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      if (isStringLiteral(expression)) found.push(expression.text);
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      if (ts.isLiteralTypeNode(argument) && isStringLiteral(argument.literal)) found.push(argument.literal.text);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isImportCall = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === 'require';
      const [first] = node.arguments;
      if ((isImportCall || isRequire) && isStringLiteral(first)) found.push(first.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

const EXTENSIONS = ['.ts', '.tsx', '.d.ts', '/index.ts', '/index.tsx'];

/** The file a relative `specifier` of `from` resolves to, or `undefined`. */
function resolveRelative(host: GraphHost, from: string, specifier: string): string | undefined {
  const base = resolve(dirname(from), specifier);
  for (const candidate of [base, ...EXTENSIONS.map((extension) => base + extension)]) {
    if (/\.(ts|tsx)$/.test(candidate) && host.read(candidate) !== undefined) return candidate;
  }
  return undefined;
}

/**
 * Walks the graph from `entry` through the relative specifiers and returns every specifier met, with the file
 * naming it. A relative specifier that resolves to no file throws: the walk would be silently incomplete.
 */
export function importGraph(entry: string, host: GraphHost): { files: string[]; edges: ImportEdge[] } {
  const seen = new Set<string>();
  const edges: ImportEdge[] = [];
  const queue = [resolve(entry)];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = host.read(file);
    if (source === undefined) throw new Error(`${file}: not found`);
    for (const specifier of moduleSpecifiers(source, file)) {
      edges.push({ from: file, specifier });
      if (!specifier.startsWith('.')) continue;
      const target = resolveRelative(host, file, specifier);
      if (target === undefined) throw new Error(`${file}: cannot resolve ${specifier}`);
      queue.push(target);
    }
  }
  return { files: [...seen].sort(), edges };
}

/** `@formrail/core` and any of its subpaths (`@formrail/core/internal`, ...). */
export const isCoreSpecifier = (specifier: string): boolean => /^@formrail\/core(\/|$)/.test(specifier);
