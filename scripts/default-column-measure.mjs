// Measure of the empty "Default" column in the Storybook props tables (ticket #460).
//
// Question: how many public props have a default in the SOURCE (a default in the destructuring of the
// component's props, or a `@default` tag) while the docgen row the table renders has no `defaultValue`?
//
// How: the docgen is run here with the options of the Storybook build (`docgenCompilerOptions`,
// `docgenPropFilter`, the same `shouldExtractLiteralValuesFromEnum` / `shouldRemoveUndefinedFromOptional`),
// imported from `.storybook/docgen.ts` so they cannot drift, through react-docgen-typescript's own parser.
// Its `ComponentDoc.props[].defaultValue` is what the build serialises into `__docgenInfo` and the table
// prints in the Default column. The source side is read with the TypeScript AST of the same files.
//
// Public components = the value exports of `packages/core/src/index.ts` and `packages/pro/src/index.ts`
// that the docgen documents as components.
//
// Usage:  node scripts/default-column-measure.mjs [--json]
// Deterministic: sorted output, no timestamps, no machine paths.
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { docgenCompilerOptions, docgenPropFilter } from '../.storybook/docgen.ts';

const require = createRequire(import.meta.url);
const { withCompilerOptions } = require('react-docgen-typescript');

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRIES = ['packages/core/src/index.ts', 'packages/pro/src/index.ts'];

const unwrap = (node) => {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
};

/** Literal initialisers: what the table could print without evaluating anything. */
export function isLiteralInitializer(node) {
  node = unwrap(node);
  if (!node) return false;
  if (
    ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  ) return true;
  if (ts.isIdentifier(node) && node.text === 'undefined') return true;
  if (ts.isPrefixUnaryExpression(node)) return isLiteralInitializer(node.operand);
  if (ts.isArrayLiteralExpression(node)) return node.elements.every(isLiteralInitializer);
  if (ts.isObjectLiteralExpression(node)) return node.properties.every((p) => ts.isPropertyAssignment(p) && isLiteralInitializer(p.initializer));
  return false;
}

/** The function-like node that implements `name` in `sf` (declaration, arrow, forwardRef/memo wrapped). */
export function findComponentFunction(sf, name, checker, depth = 0) {
  const fnOf = (node) => {
    node = unwrap(node);
    if (!node || depth > 4) return undefined;
    if (ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isFunctionDeclaration(node)) return node;
    if (ts.isCallExpression(node)) for (const arg of node.arguments) { const f = fnOf(arg); if (f) return f; }
    // `forwardRef(Impl)` / `export const Dialog = ModalImpl`: follow the identifier (same file or another one).
    if (ts.isIdentifier(node) && checker) {
      let sym = checker.getSymbolAtLocation(node);
      if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
      const decl = sym?.declarations?.[0];
      if (decl && !decl.getSourceFile().fileName.includes('/node_modules/')) return findComponentFunction(decl.getSourceFile(), sym.name, checker, depth + 1);
    }
    return undefined;
  };
  let found;
  const visit = (node) => {
    if (found) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) found = fnOf(node.initializer);
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/**
 * Defaults written in the destructuring of the first parameter, or of `const {...} = props` in the body.
 * Returns a Map of prop name -> `{ text, literal }`.
 */
export function destructuringDefaults(fn, sf) {
  const out = new Map();
  const take = (pattern, where) => {
    for (const el of pattern.elements) {
      if (el.dotDotDotToken || !el.initializer) continue;
      const key = el.propertyName ?? el.name;
      if (!ts.isIdentifier(key) && !ts.isStringLiteral(key)) continue;
      out.set(key.text, { text: el.initializer.getText(sf), literal: isLiteralInitializer(el.initializer), where });
    }
  };
  const param = fn.parameters[0];
  if (!param) return out;
  if (ts.isObjectBindingPattern(param.name)) take(param.name, 'param');
  else if (ts.isIdentifier(param.name) && fn.body && ts.isBlock(fn.body)) {
    for (const st of fn.body.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        if (ts.isObjectBindingPattern(d.name) && d.initializer) {
          // `props`, `props as Omit<...> & {...}`, `(props satisfies X)`, `props!`: unwrap before comparing.
          const init = unwrap(d.initializer);
          if (ts.isIdentifier(init) && init.text === param.name.text) take(d.name, 'body');
        }
      }
    }
  }
  return out;
}


/** Names bound by the parameter and by the rest element of its destructuring (`props`, `...rest`). */
function propsBindings(fn) {
  const names = new Set();
  const param = fn.parameters[0];
  if (!param) return names;
  const collectRest = (pattern) => {
    for (const el of pattern.elements) if (el.dotDotDotToken && ts.isIdentifier(el.name)) names.add(el.name.text);
  };
  if (ts.isIdentifier(param.name)) {
    names.add(param.name.text);
    if (fn.body && ts.isBlock(fn.body)) {
      for (const st of fn.body.statements) {
        if (!ts.isVariableStatement(st)) continue;
        for (const d of st.declarationList.declarations) {
          const init = d.initializer && unwrap(d.initializer);
          if (ts.isObjectBindingPattern(d.name) && init && ts.isIdentifier(init) && init.text === param.name.text) collectRest(d.name);
        }
      }
    }
  } else if (ts.isObjectBindingPattern(param.name)) collectRest(param.name);
  return names;
}

/**
 * The internal components a public one hands its props to: `<Inner {...props} />` (or `{...rest}`),
 * `return Inner(props)`, or props passed one by one with the same name (`<Inner side={side} />`).
 * Returns `{ targets: [{ fn, name, names }], unresolved: [string] }`; `names` is `null` for "all props" (a
 * spread), else the list of names passed one by one. A target is a function of the project (not
 * node_modules) other than `fn` itself; a project symbol whose function cannot be found is `unresolved`.
 */
export function findDelegates(fn, checker) {
  const targets = [];
  const unresolved = [];
  const bindings = propsBindings(fn);
  if (!fn.body) return { targets, unresolved };
  const resolve = (ident) => {
    let sym = checker.getSymbolAtLocation(ident);
    if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    const decl = sym?.declarations?.[0];
    if (!decl || decl.getSourceFile().fileName.includes('/node_modules/')) return undefined;
    // Local variables and parameters (render callbacks, `Comp` props...) are not internal components.
    if (!ts.isFunctionDeclaration(decl) && !(ts.isVariableDeclaration(decl) && ts.isSourceFile(decl.parent.parent.parent))) return undefined;
    const target = findComponentFunction(decl.getSourceFile(), sym.name, checker);
    if (target === fn) return undefined;
    return { name: sym.name, target };
  };
  const add = (ident, names) => {
    const r = resolve(ident);
    if (!r) return;
    if (!r.target) unresolved.push(r.name);
    else targets.push({ fn: r.target, name: r.name, names });
  };
  const visit = (node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      if (ts.isIdentifier(node.tagName) && /^[A-Z]/.test(node.tagName.text)) {
        let spread = false;
        const named = [];
        for (const a of node.attributes.properties) {
          if (ts.isJsxSpreadAttribute(a)) {
            const e = unwrap(a.expression);
            if (ts.isIdentifier(e) && bindings.has(e.text)) spread = true;
          } else if (a.initializer && ts.isJsxExpression(a.initializer) && a.initializer.expression) {
            const e = unwrap(a.initializer.expression);
            if (ts.isIdentifier(e) && e.text === a.name.getText()) named.push(e.text);
          }
        }
        if (spread || named.length) add(node.tagName, spread ? null : named);
      }
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && !/^use[A-Z]/.test(node.expression.text)) {
      const [first] = node.arguments;
      const e = first && unwrap(first);
      if (e && ts.isIdentifier(e) && bindings.has(e.text) && node.arguments.length <= 2) add(node.expression, null);
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return { targets, unresolved };
}

/**
 * Defaults a component gets from the internal components it delegates to (recursively, depth-limited),
 * as a Map prop -> `{ text, literal, where: 'delegated', via }`, plus the delegations that could not be followed.
 */
export function delegatedDefaults(fn, checker, seen = new Set(), depth = 0) {
  const out = new Map();
  const unresolved = [];
  if (depth > 3 || seen.has(fn)) return { out, unresolved };
  seen.add(fn);
  const { targets, unresolved: u } = findDelegates(fn, checker);
  unresolved.push(...u);
  for (const t of targets) {
    const own = destructuringDefaults(t.fn, t.fn.getSourceFile());
    const deeper = delegatedDefaults(t.fn, checker, seen, depth + 1);
    unresolved.push(...deeper.unresolved);
    for (const [name, d] of [...deeper.out, ...own]) {
      if (t.names && !t.names.includes(name)) continue;
      if (!out.has(name)) out.set(name, { text: d.text, literal: d.literal, where: 'delegated', via: t.name });
    }
  }
  return { out, unresolved };
}

/** "Default `x`" / "Defaults to `x`" written in a prop's TSDoc prose. */
export const PROSE_DEFAULT = /\bdefaults?\b(?:\s+(?:to|is|are))?\s*[:=]?\s*`[^`]+`/i;

/**
 * Why a default is lost by the docgen (priority order, one cause per prop):
 * - `delegated`: the default lives in an internal component the public one hands its props to;
 * - `body-destructuring`: the default is in `const { x = 1 } = props` inside the body, not in the parameter;
 * - `alias`: the component is `export const A = B` of a function declared under another name/file;
 * - `non-literal`: the default is an identifier/expression (`DEFAULT_OVERSCAN`);
 * - `other`: anything else (to investigate).
 * `union` is reported as a separate flag: the prop is also declared in a branch of a union of props.
 */
export function causeOf(src, fn, docSf) {
  if (src?.where === 'delegated') return 'delegated';
  if (src?.where === 'body') return 'body-destructuring';
  if (fn && fn.getSourceFile() !== docSf) return 'alias';
  if (src && !src.literal) return 'non-literal';
  return 'other';
}

/** A prop that is a member of a type literal in more than one branch of a union type => 'union', else 'other'. */
export function unionCause(sf, propName) {
  let hits = 0;
  const visit = (node) => {
    if (ts.isUnionTypeNode(node)) {
      for (const branch of node.types) {
        const members = [];
        const collect = (n) => {
          if (ts.isTypeLiteralNode(n)) members.push(...n.members);
          else if (ts.isIntersectionTypeNode(n)) n.types.forEach(collect);
          else if (ts.isParenthesizedTypeNode(n)) collect(n.type);
        };
        collect(branch);
        if (members.some((m) => m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) && m.name.text === propName)) hits++;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits >= 1 ? 'union' : 'other';
}

export function measure({ root = REPO_ROOT, entries = ENTRIES } = {}) {
  const entryFiles = entries.map((e) => resolve(root, e));
  const program = ts.createProgram(entryFiles, docgenCompilerOptions);
  const checker = program.getTypeChecker();
  const publicNames = new Set();
  for (const file of entryFiles) {
    const sf = program.getSourceFile(file);
    for (const sym of checker.getExportsOfModule(checker.getSymbolAtLocation(sf))) {
      // Re-exports are aliases: resolve to the target before reading the flags.
      const target = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
      if (target.flags & ts.SymbolFlags.Value) publicNames.add(sym.name);
    }
  }

  // Every component file of the docgen's include globs, minus stories/tests (like the Storybook build).
  const files = program
    .getSourceFiles()
    .map((s) => s.fileName)
    .filter((f) => /\/packages\/(core|pro)\/src\/.*\.tsx$/.test(f) && !/\.(stories|test)\.tsx$/.test(f) && !f.includes('/node_modules/'))
    .sort();
  const parser = withCompilerOptions(docgenCompilerOptions, {
    shouldExtractLiteralValuesFromEnum: true,
    shouldRemoveUndefinedFromOptional: true,
    propFilter: docgenPropFilter,
  });
  const docs = parser.parse(files);

  const components = [];
  const seen = new Set();
  for (const doc of docs) {
    if (!publicNames.has(doc.displayName)) continue;
    const rel = relative(root, doc.filePath).split('\\').join('/');
    const key = `${doc.displayName}@${rel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sf = program.getSourceFile(doc.filePath);
    const fn = sf && findComponentFunction(sf, doc.displayName, checker);
    const defaults = fn ? destructuringDefaults(fn, fn.getSourceFile()) : new Map();
    const delegated = fn ? delegatedDefaults(fn, checker) : { out: new Map(), unresolved: [] };
    const shape = !fn ? 'not-found' : ts.isFunctionDeclaration(fn) ? 'function' : 'wrapped/arrow';
    const rows = [];
    const inTable = new Set(Object.keys(doc.props));
    for (const [name, prop] of Object.entries(doc.props)) {
      const tagDefault = prop.tags?.default ?? prop.tags?.defaultValue;
      const src = defaults.get(name) ?? delegated.out.get(name);
      const hasSource = src !== undefined || tagDefault !== undefined;
      const emptyCol = prop.defaultValue == null;
      const source = src ? src.text : `@default ${tagDefault}`;
      const literal = src ? src.literal : true;
      if (hasSource && emptyCol) rows.push({ prop: name, kind: 'gap', source, literal, where: src ? src.where : 'tag', union: unionCause(sf, name) === 'union', cause: causeOf(src, fn, sf), via: src?.via });
      else if (!hasSource && emptyCol && PROSE_DEFAULT.test(prop.description ?? '')) rows.push({ prop: name, kind: 'prose-only', source: '(prose in TSDoc)', literal: false, cause: 'other' });
      else if (hasSource) rows.push({ prop: name, kind: 'ok', source, literal, where: src ? src.where : 'tag', union: unionCause(sf, name) === 'union', cause: '' });
      // No destructuring default but the column is filled: the docgen read a `@default` tag (it does).
      else if (!emptyCol) rows.push({ prop: name, kind: 'ok', source: `@default ${prop.defaultValue.value}`, literal: true, where: 'tag', union: unionCause(sf, name) === 'union', cause: '' });
    }
    const defaultsNotInTable = [...defaults.keys()].filter((k) => !inTable.has(k)).sort();
    components.push({ component: doc.displayName, file: rel, shape, propsInTable: inTable.size, rows: rows.sort((a, b) => a.prop.localeCompare(b.prop)), defaultsNotInTable, unresolvedDelegations: [...new Set(delegated.unresolved)].sort() });
  }
  components.sort((a, b) => a.component.localeCompare(b.component) || a.file.localeCompare(b.file));
  return { components, summary: summarize(components) };
}

export function summarize(components) {
  const gaps = components.flatMap((c) => c.rows.filter((r) => r.kind === 'gap').map((r) => ({ ...r, component: c.component })));
  const withSource = components.reduce((n, c) => n + c.rows.filter((r) => r.kind === 'gap' || r.kind === 'ok').length, 0);
  const cnt = (f) => gaps.filter(f).length;
  const comps = (f) => new Set(gaps.filter(f).map((g) => g.component)).size;
  return {
    publicComponents: components.length,
    propsWithSourceDefault: withSource,
    emptyDefaultColumn: gaps.length,
    componentsAffected: comps(() => true),
    byCause: Object.fromEntries(
      ['body-destructuring', 'delegated', 'alias', 'non-literal', 'other'].map((c) => [c, { props: cnt((g) => g.cause === c), components: comps((g) => g.cause === c) }]),
    ),
    inUnionOfProps: { props: cnt((g) => g.union), components: comps((g) => g.union) },
    byLiteral: { literal: cnt((g) => g.literal), dependsOnOtherValue: cnt((g) => !g.literal) },
    proseOnly: components.reduce((n, c) => n + c.rows.filter((r) => r.kind === 'prose-only').length, 0),
    defaultsNotInTable: components.reduce((n, c) => n + c.defaultsNotInTable.length, 0),
    unresolvedDelegations: components.flatMap((c) => c.unresolvedDelegations.map((u) => `${c.component} -> ${u}`)),
    shapes: Object.fromEntries(['function', 'wrapped/arrow', 'not-found'].map((s) => [s, components.filter((c) => c.shape === s).length])),
  };
}

export function format({ components, summary }) {
  const lines = ['# Empty Default column (ticket #460)', '', '```json', JSON.stringify(summary, null, 2), '```', ''];
  lines.push('## Gaps (default in source, empty Default column)', '', '| Component | Prop | Source default | Literal | Cause | Via | In union |', '|---|---|---|---|---|---|---|');
  for (const c of components) for (const r of c.rows.filter((x) => x.kind === 'gap')) lines.push(`| ${c.component} | ${r.prop} | \`${r.source.replace(/\s+/g, ' ')}\` | ${r.literal ? 'yes' : 'no'} | ${r.cause} | ${r.via ?? ''} | ${r.union ? 'yes' : 'no'} |`);
  lines.push('', '## Default only in prose', '', '| Component | Prop |', '|---|---|');
  for (const c of components) for (const r of c.rows.filter((x) => x.kind === 'prose-only')) lines.push(`| ${c.component} | ${r.prop} |`);
  lines.push('', '## Destructuring defaults of props absent from the table (filtered HTML attributes, internal)', '');
  for (const c of components) if (c.defaultsNotInTable.length) lines.push(`- ${c.component}: ${c.defaultsNotInTable.join(', ')}`);
  return lines.join('\n') + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = measure();
  process.stdout.write(process.argv.includes('--json') ? JSON.stringify(result, null, 2) + '\n' : format(result));
}
