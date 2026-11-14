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
// Usage:  node scripts/default-column-measure.mjs [--json]            (the measure)
//         node scripts/default-column-measure.mjs --check [--json]   (the guard: exit 1 on gaps or incoherences;
//                                                                     not wired to CI yet, that is ticket #476)
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
      out.set(key.text, { text: el.initializer.getText(sf), literal: isLiteralInitializer(el.initializer), where, node: el.initializer });
    }
  };
  const param = fn.parameters[0];
  if (!param) return out;
  // The names that hold the props in the body: the parameter, or the rest element of its destructuring
  // (`function C({ a = 1, ...props }) { const { b = 2 } = props; }`), and the rest of a body destructuring.
  const holders = new Set();
  const restOf = (pattern) => {
    for (const el of pattern.elements) if (el.dotDotDotToken && ts.isIdentifier(el.name)) holders.add(el.name.text);
  };
  if (ts.isObjectBindingPattern(param.name)) {
    take(param.name, 'param');
    restOf(param.name);
  } else if (ts.isIdentifier(param.name)) holders.add(param.name.text);
  if (holders.size && fn.body && ts.isBlock(fn.body)) {
    for (const st of fn.body.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        if (ts.isObjectBindingPattern(d.name) && d.initializer) {
          // `props`, `props as Omit<...> & {...}`, `(props satisfies X)`, `props!`: unwrap before comparing.
          const init = unwrap(d.initializer);
          if (ts.isIdentifier(init) && holders.has(init.text)) {
            take(d.name, 'body');
            restOf(d.name);
          }
        }
      }
    }
  }
  return out;
}


/**
 * What the body of `fn` knows about its props, by symbol (so a local variable with the same name is not taken
 * for a prop):
 * - `objects`: the props object and the rest bindings of its destructuring (`props`, `...rest`), each with the keys
 *   it does NOT carry (`const { a, ...rest } = props`: `rest` lacks `a`);
 * - `propOf(expr)`: the public prop an expression is, unchanged: a binding of the destructuring (`{ side }`,
 *   `{ side: s }`, `const { side } = props`), or `props.side` / `rest.side`. `undefined` for anything else.
 * - `objectOf(expr)`: the excluded keys when `expr` is one of `objects`, else `undefined`.
 */
export function propsScope(fn, checker) {
  const objects = new Map();
  const bound = new Map();
  const symOf = (node) => checker.getSymbolAtLocation(node);
  const take = (pattern, excluded) => {
    const keys = [];
    let rest;
    for (const el of pattern.elements) {
      if (el.dotDotDotToken) { if (ts.isIdentifier(el.name)) rest = symOf(el.name); continue; }
      const key = el.propertyName ?? el.name;
      if (!ts.isIdentifier(key) && !ts.isStringLiteral(key)) continue;
      keys.push(key.text);
      if (ts.isIdentifier(el.name) && !excluded.has(key.text)) bound.set(symOf(el.name), key.text);
    }
    if (rest) objects.set(rest, new Set([...excluded, ...keys]));
  };
  const param = fn.parameters[0];
  if (param && ts.isIdentifier(param.name)) objects.set(symOf(param.name), new Set());
  else if (param && ts.isObjectBindingPattern(param.name)) take(param.name, new Set());
  if (param && fn.body && ts.isBlock(fn.body)) {
    for (const st of fn.body.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        const init = d.initializer && unwrap(d.initializer);
        const from = init && ts.isIdentifier(init) ? objects.get(symOf(init)) : undefined;
        if (from && ts.isObjectBindingPattern(d.name)) take(d.name, from);
      }
    }
  }
  const objectOf = (expr) => {
    const e = unwrap(expr);
    return e && ts.isIdentifier(e) ? objects.get(symOf(e)) : undefined;
  };
  const propOf = (expr) => {
    const e = unwrap(expr);
    if (!e) return undefined;
    if (ts.isIdentifier(e)) return bound.get(symOf(e));
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.name)) {
      const excluded = objectOf(e.expression);
      if (excluded && !excluded.has(e.name.text)) return e.name.text;
    }
    return undefined;
  };
  return { objects, objectOf, propOf };
}

/**
 * What a child receives from the public props, read from its JSX attributes or from the properties of an object
 * literal (`useX({ a, ...props })`), in source order:
 * - a spread of the props (or of a rest binding) hands every prop except the keys that binding lacks;
 * - a key passed unchanged (`a={a}`, `a={props.a}`, `{ a }`, `b={a}` renamed) maps the child key to the public prop;
 * - a key set to anything else (`a="fixed"`, `a={local}`, `a={a ?? 'x'}`) is NOT the public prop: the child's
 *   default for it does not apply to the public one. A key set before a props spread that carries it has two
 *   possible sources, so it is not attributed either (conservative: never a wrong default).
 * - a spread of something that is not the props (`{...unrelated}`) is ignored (limit: it could override a key).
 * `extra(entry)` lets the caller read other spreads (a render-prop parameter): it returns `{ keys, changed }` or
 * `undefined`. Returns `{ all, exclude, map }` (`map`: child key -> public prop or `null` for "not the public one").
 */
function handedOf(entries, scope, extra) {
  let all = false;
  let exclude = new Set();
  const map = new Map();
  for (const en of entries) {
    if (en.spread) {
      const excluded = scope.objectOf(en.spread);
      if (excluded) {
        exclude = all ? new Set([...exclude].filter((k) => excluded.has(k))) : new Set(excluded);
        all = true;
        for (const [k, v] of map) if (!excluded.has(k) && v !== k) map.set(k, null);
        continue;
      }
      const r = extra?.(en.spread);
      if (r) {
        for (const k of r.changed) map.set(k, null);
        for (const k of r.keys) map.set(k, k);
      }
    } else map.set(en.key, en.value ? scope.propOf(en.value) ?? null : null);
  }
  return { all, exclude, map };
}

/** The public prop a child key stands for under `handed`, or `null` when the child's default does not apply to it. */
const publicKeyOf = (handed, key) => (handed.map.has(key) ? handed.map.get(key) : handed.all && !handed.exclude.has(key) ? key : null);
const handsAnything = (handed) => handed.all || [...handed.map.values()].some((v) => v !== null);

/**
 * The internal components a public one hands its props to (see `handedOf` for which props, key by key):
 * - JSX: `<Inner {...props} />`, `<Inner {...rest} />` (minus the keys destructured before `...rest`),
 *   `<Inner side={side} />`, `<Inner side={props.side} />`, `<Inner side={placement} />` (renamed), and the same
 *   with a member tag (`<Parts.Inner {...props} />`, a namespace import or `Object.assign(Root, { Inner })`);
 * - calls: `Inner(props)`, `useX(props, ref)` (a hook that destructures the defaults), `useX({ a, b: props.b })`,
 *   `useX({ ...props })`, `helpers.useX(props)`, at most two arguments, the first one carrying the props.
 * A member of a parameter or a local (a callback prop `props.onChange(props)`, a component taken from a context
 * `<ctx.Row {...props} />`) is a value the consumer provides, not an internal component: not followed.
 * A key set to another value (`a="fixed"`, a local `a`, a key after the spread) is not delegated.
 *
 * Render-prop delegation: `<Host renderX={(p) => <Child {...p} />} />` where `Host` (a project component) calls
 * `renderX({ status, loadingRowCount, ... })`: what `Child` gets through `{...p}`, `status={p.status}` or, with a
 * destructured parameter, `({ status }) => <Child status={status} />`, is the set of keys `Host` passes to
 * `renderX` unchanged (shorthand or `key: key`), narrowed to the props the public component hands to `Host`. If
 * `Host` is not a project function with such a call, the delegation goes in `unresolved` (`Host.renderX`), never
 * silent; so does a destructured parameter with a rest element (`({ a, ...p }) => <Child {...p} />`).
 *
 * Not followed, by design (none in the repository):
 * - a call whose first argument is neither the props nor an object literal (`useX(build(props))`) and a call with
 *   more than two arguments: not reported, the value handed is computed;
 * - a spread of something that is not the props (`{...unrelated}`): ignored, even when it could override a key;
 * - a JSX tag or callee that is a project value but not a function the script can read (`const X = make()`,
 *   `<X.Y />` on a computed object): listed in `unresolved` with its text.
 * Components of node_modules (Radix) are never followed: their defaults are invisible to this script, which is
 * why a `@default` with no source default needs an allowlist entry (see `check`).
 *
 * Returns `{ targets: [{ fn, name, handed }], unresolved: [string] }`. A target is a function of the project (not
 * node_modules) other than `fn` itself; a project symbol whose function cannot be found is `unresolved`.
 */
export function findDelegates(fn, checker) {
  const targets = [];
  const unresolved = [];
  if (!fn.body) return { targets, unresolved };
  const scope = propsScope(fn, checker);
  /** Callback parameter name -> `{ keys, changed }`: keys the host passes to it unchanged (and the public component
   * hands to the host), and the other keys it passes (which override a spread). */
  const renderParams = new Map();
  /** A project symbol -> `{ name, target }` (target `undefined` when its function cannot be read). */
  const resolveSymbol = (sym, text, depth = 0) => {
    if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    const decl = sym?.declarations?.[0];
    if (!decl || decl.getSourceFile().fileName.includes('/node_modules/')) return undefined;
    // `Object.assign(Root, { Item: MenuItem })` / `{ MenuItem }`: the member is another identifier.
    if (depth < 3 && ts.isPropertyAssignment(decl) && ts.isIdentifier(unwrap(decl.initializer))) return resolveSymbol(checker.getSymbolAtLocation(unwrap(decl.initializer)), text, depth + 1);
    if (depth < 3 && ts.isShorthandPropertyAssignment(decl)) return resolveSymbol(checker.getShorthandAssignmentValueSymbol(decl), text, depth + 1);
    const topLevel = ts.isFunctionDeclaration(decl) || (ts.isVariableDeclaration(decl) && ts.isSourceFile(decl.parent.parent.parent));
    // Local variables and parameters (render callbacks, `Comp` props...) are not internal components; a member of
    // a project object (`resolve` checked the root) that is not a readable function is listed as unresolved.
    if (!topLevel) return text.includes('.') ? { name: text, target: undefined } : undefined;
    const target = findComponentFunction(decl.getSourceFile(), sym.name, checker);
    if (target === fn) return undefined;
    return { name: target ? sym.name : text, target };
  };
  /** Whether the root of `Root.Member` is a project module or top-level value (else a local: a consumer value). */
  const projectRoot = (node) => {
    let root = node;
    while (ts.isPropertyAccessExpression(root)) root = root.expression;
    if (!ts.isIdentifier(root)) return false;
    let sym = checker.getSymbolAtLocation(root);
    if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    const decl = sym?.declarations?.[0];
    if (!decl || decl.getSourceFile().fileName.includes('/node_modules/')) return false;
    return ts.isSourceFile(decl) || ts.isModuleDeclaration(decl) || ts.isFunctionDeclaration(decl) || (ts.isVariableDeclaration(decl) && ts.isSourceFile(decl.parent.parent.parent));
  };
  const resolve = (node) => {
    // `props.onChange(...)`, `<ctx.Row />`: a member of a parameter or a local is a value the consumer provides.
    if (ts.isPropertyAccessExpression(node) && !projectRoot(node)) return undefined;
    return resolveSymbol(checker.getSymbolAtLocation(node), node.getText());
  };
  /** A JSX tag the script reads as a component: `Inner` (capitalised) or `Parts.Inner`. */
  const isComponentTag = (tag) => (ts.isIdentifier(tag) && /^[A-Z]/.test(tag.text)) || ts.isPropertyAccessExpression(tag);
  const add = (node, handed) => {
    if (!handsAnything(handed)) return;
    const r = resolve(node);
    if (!r) return;
    if (!r.target) unresolved.push(r.name);
    else targets.push({ fn: r.target, name: r.name, handed });
  };
  /** The JSX attributes as `handedOf` entries; a render-prop parameter `p` counts through `{...p}` and `p.key`. */
  const entriesOfJsx = (node) =>
    node.attributes.properties.map((a) =>
      ts.isJsxSpreadAttribute(a)
        ? { spread: a.expression }
        : { key: a.name.getText(), value: a.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : undefined },
    );
  const renderSpread = (expr) => {
    const e = unwrap(expr);
    return e && ts.isIdentifier(e) ? renderParams.get(e.text) : undefined;
  };
  /** Bindings of a destructured render-callback parameter (`({ status }) => ...`) -> the public prop they carry. */
  const renderBindings = new Map();
  /** `scope` extended with the render-prop parameters: `status={p.status}` (or `status={status}` of a destructured
   * parameter) is the public `status` when the host hands it on unchanged. */
  const jsxScope = {
    objectOf: scope.objectOf,
    propOf: (expr) => {
      const own = scope.propOf(expr);
      if (own !== undefined) return own;
      const e = unwrap(expr);
      if (e && ts.isIdentifier(e)) return renderBindings.get(checker.getSymbolAtLocation(e));
      if (e && ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.name)) return renderSpread(e.expression)?.keys.includes(e.name.text) ? e.name.text : undefined;
      return undefined;
    },
  };
  /** What a JSX element receives from the public component's props. */
  const attrsOf = (node) => handedOf(entriesOfJsx(node), jsxScope, renderSpread);
  /**
   * What `host` passes to its `renderName({ ... })` calls: `keys` unchanged (shorthand or `key: key`), `changed`
   * the other keys; `undefined` when there is no call with an object literal.
   */
  const renderCallKeys = (host, renderName) => {
    let found;
    const visitHost = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === renderName) {
        const arg = n.arguments[0] && unwrap(n.arguments[0]);
        if (arg && ts.isObjectLiteralExpression(arg)) {
          found ??= { keys: [], changed: [] };
          for (const p of arg.properties) {
            if (ts.isShorthandPropertyAssignment(p)) found.keys.push(p.name.text);
            else if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
              const v = unwrap(p.initializer);
              if (ts.isIdentifier(v) && v.text === p.name.text) found.keys.push(p.name.text);
              else found.changed.push(p.name.text);
            }
          }
        }
      }
      ts.forEachChild(n, visitHost);
    };
    if (host.body) visitHost(host.body);
    return found;
  };
  const registerRenderProps = (node) => {
    if (!isComponentTag(node.tagName)) return;
    for (const a of node.attributes.properties) {
      if (!ts.isJsxAttribute(a) || !a.initializer || !ts.isJsxExpression(a.initializer) || !a.initializer.expression) continue;
      const cb = unwrap(a.initializer.expression);
      if (!(ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) || !cb.parameters[0]) continue;
      const pname = cb.parameters[0].name;
      // `(p) => ...` or `({ status, count }) => ...`: the bindings of a destructured parameter, by symbol.
      const patternKeys = new Map();
      let patternRest = false;
      if (ts.isObjectBindingPattern(pname)) {
        for (const el of pname.elements) {
          if (el.dotDotDotToken) { patternRest = true; continue; }
          const key = el.propertyName ?? el.name;
          if (ts.isIdentifier(el.name) && (ts.isIdentifier(key) || ts.isStringLiteral(key))) patternKeys.set(checker.getSymbolAtLocation(el.name), key.text);
        }
      } else if (!ts.isIdentifier(pname)) continue;
      // Only a callback that hands its parameter to a child (`{...p}`, `key={p.key}`, `key={key}` of the pattern)
      // passes props on (`onChange={(e) => ...}` does not).
      const isParam = (e) => e && ts.isIdentifier(pname) && ts.isIdentifier(e) && e.text === pname.text;
      const isBinding = (e) => e && ts.isIdentifier(e) && patternKeys.has(checker.getSymbolAtLocation(e));
      let hands = false;
      const findUse = (n) => {
        if (ts.isJsxSpreadAttribute(n) && isParam(unwrap(n.expression))) hands = true;
        if (ts.isJsxAttribute(n) && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression) {
          const e = unwrap(n.initializer.expression);
          if ((ts.isPropertyAccessExpression(e) && isParam(unwrap(e.expression))) || isBinding(e)) hands = true;
        }
        ts.forEachChild(n, findUse);
      };
      findUse(cb.body);
      const r = (hands || patternRest) && resolve(node.tagName);
      if (!r) continue;
      const attrName = a.name.getText();
      const call = r.target && renderCallKeys(r.target, attrName);
      // A rest element of a destructured callback parameter (`({ a, ...p }) => <Child {...p} />`) is not followed.
      if (!call || patternRest) { unresolved.push(`${r.name}.${attrName}`); continue; }
      // Of the keys the host hands on unchanged, only those it gets from the public props under the same name.
      const host = attrsOf(node);
      const keys = call.keys.filter((k) => publicKeyOf(host, k) === k);
      if (ts.isIdentifier(pname)) renderParams.set(pname.text, { keys, changed: [...call.changed, ...call.keys.filter((k) => !keys.includes(k))] });
      for (const [sym, key] of patternKeys) if (keys.includes(key)) renderBindings.set(sym, key);
    }
  };
  /** A call's first argument as `handedOf` entries: the props object itself, or an object literal. */
  const entriesOfArg = (arg) => {
    const e = unwrap(arg);
    if (!e) return [];
    if (scope.objectOf(e)) return [{ spread: e }];
    if (!ts.isObjectLiteralExpression(e)) return [];
    return e.properties.map((p) => {
      if (ts.isSpreadAssignment(p)) return { spread: p.expression };
      if (ts.isShorthandPropertyAssignment(p)) return { key: p.name.text, value: p.name };
      if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return { key: p.name.text, value: p.initializer };
      return { key: p.name?.getText() ?? '', value: undefined };
    });
  };
  /** `scope` that also reads a shorthand `{ a }` (whose name node resolves to the property, not the variable). */
  const argScope = {
    objectOf: scope.objectOf,
    propOf: (expr) => {
      if (ts.isIdentifier(expr) && ts.isShorthandPropertyAssignment(expr.parent) && expr.parent.name === expr) {
        const v = checker.getShorthandAssignmentValueSymbol(expr.parent);
        const decl = v?.declarations?.[0];
        return decl && ts.isBindingElement(decl) ? scope.propOf(decl.name) : undefined;
      }
      return scope.propOf(expr);
    },
  };
  const visit = (node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      registerRenderProps(node);
      if (isComponentTag(node.tagName)) add(node.tagName, attrsOf(node));
    } else if (ts.isCallExpression(node) && (ts.isIdentifier(node.expression) || ts.isPropertyAccessExpression(node.expression))) {
      const [first] = node.arguments;
      if (first && node.arguments.length <= 2) add(node.expression, handedOf(entriesOfArg(first), argScope));
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return { targets, unresolved };
}

/**
 * Defaults a component gets from the internal components it delegates to (recursively, depth-limited),
 * as a Map prop -> `{ text, literal, where: 'delegated', via }`, plus the delegations that could not be followed.
 * A child key maps back to the public prop it was handed from (`publicKeyOf`); a key the public component set to
 * another value, or did not hand on, carries no default.
 */
export function delegatedDefaults(fn, checker, seen = new Set(), depth = 0) {
  const out = new Map();
  const unresolved = [];
  if (depth > 3 || seen.has(fn)) return { out, unresolved };
  seen.add(fn); // the current path only (cycle guard): a component reached by two branches is read twice
  const { targets, unresolved: u } = findDelegates(fn, checker);
  unresolved.push(...u);
  for (const t of targets) {
    const own = destructuringDefaults(t.fn, t.fn.getSourceFile());
    const deeper = delegatedDefaults(t.fn, checker, seen, depth + 1);
    unresolved.push(...deeper.unresolved);
    // The nearer component wins: its default replaces `undefined` before the value reaches the deeper one.
    for (const [name, d] of [...own, ...deeper.out]) {
      const pub = publicKeyOf(t.handed, name);
      if (pub === null) continue;
      if (!out.has(pub)) out.set(pub, { text: d.text, literal: d.literal, where: 'delegated', via: t.name, node: d.node });
    }
  }
  seen.delete(fn);
  return { out, unresolved };
}

/**
 * A default stated in a prop's TSDoc prose: "Default `x`", "Defaults to 'md'", `Default "Loading"`, "Default 1.",
 * "default: true", "(default "Sections")", "the default is `md`". The value is delimited (backticks, single,
 * double or typographic quotes) or bare when it is a number, `true`, `false`, `null` or `undefined`.
 * Not a default statement:
 * - the word inside quotes or backticks ("not allowed with `default`", `tone="default"`): it names a value;
 * - "the default `<div>`" (an article, then the value with no verb): it qualifies a noun ("instead of the default
 *   `<div>`" is the element `asChild` replaces, not the default of `asChild`);
 * - "defaults" glued to a word ("defaultValue", "default's").
 * The value can also come first, marked as the default among the options: "`automatic` (default): ...",
 * "`0` (default)", "`auto` (the default)".
 * `hasProseDefault` (what `measure` uses) also drops a default stated for a NAMED KEY of the prop, not for the prop
 * itself: "`anchorBar`: the name of the `<nav>` (default "Sections")" (ObjectPage.labels), "`align`: `auto`
 * (default)", "`text`: ... (default 100%)".
 */
const PROSE_VALUE = String.raw`(?:\x60[^\x60]+\x60|"[^"\n]*"|'[^'\n]*'|“[^”\n]*”|‘[^’\n]*’|-?\d+(?:\.\d+)?\b|(?:true|false|null|undefined)\b)`;
const PROSE_STATED =
  String.raw`(?<![\x60'"“‘\w])(?:(?<!\b(?:the|a|an|its|their)\s+)defaults?(?:\s+(?:to|is|are)\s*|\s*[:=]\s*|\s+|(?=\x60))` +
  String.raw`|\b(?:the|a|an|its|their)\s+defaults?(?:\s+(?:value\s+)?(?:is|are)\s*|\s*[:=]\s*))` +
  `(${PROSE_VALUE})`;
const PROSE_MARKED = `(${PROSE_VALUE})` + String.raw`\s*\((?:the\s+)?default\)`;
export const PROSE_DEFAULT = new RegExp(`(?:${PROSE_STATED}|${PROSE_MARKED})`, 'i');

/** "`key`:" opening the clause: what follows is about a key of the prop (an object, or one variant), not the prop. */
const NAMED_KEY = /\x60[^\x60\s]+\x60\s*:/;

/**
 * The value of the first default the prose states for the prop (`"Loading"`, `` `md` ``, `1`), `undefined` when
 * none: a `PROSE_DEFAULT` match that is not in a clause opened by a named key ("`anchorBar`: ... (default
 * "Sections")"). A clause ends at `.`, `;`, `!` or `?` followed by a space, or at a blank line.
 */
export function proseDefaultOf(text) {
  const all = new RegExp(PROSE_DEFAULT.source, 'gi');
  for (const m of String(text).matchAll(all)) {
    const clause = String(text).slice(0, m.index).split(/(?<=[.;!?])\s+|\n\s*\n/).at(-1);
    if (!NAMED_KEY.test(clause)) return m[1] ?? m[2];
  }
  return undefined;
}

/** Whether the prose states a default of the prop (see `proseDefaultOf`). */
export const hasProseDefault = (text) => proseDefaultOf(text) !== undefined;

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

/**
 * The literal a default initialiser stands for: itself when literal, else the literal of the `const` it names
 * (same file or imported, followed through aliases, depth-limited). `undefined` when it cannot be resolved
 * without evaluating anything (`stepFrom(x)`, `a ?? b`, a template with substitutions, a non-const).
 */
export function literalNodeOf(node, checker, depth = 0) {
  node = unwrap(node);
  if (!node || depth > 4) return undefined;
  if (isLiteralInitializer(node)) return node;
  if (ts.isIdentifier(node)) {
    let sym = checker.getSymbolAtLocation(node);
    if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    const decl = sym?.declarations?.[0];
    if (decl && ts.isVariableDeclaration(decl) && decl.initializer && ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const) return literalNodeOf(decl.initializer, checker, depth + 1);
  }
  return undefined;
}

/**
 * Comparable form of a default, on both sides (`@default` text and source initialiser): whitespace collapsed
 * and removed around punctuation, every quote (`'`, `"`, backtick) read as `"`, and the quotes of a plain string
 * dropped. `''` (empty string) becomes the empty string and is NOT the same as an absent default
 * (`undefined` the JS value, a missing tag); `undefined`/`null`/`false`/`0` stay as written.
 */
export function normalizeDefault(text) {
  let t = String(text).trim().replace(/['`]/g, '"').replace(/\s+/g, ' ').replace(/\s*([[\]{},:])\s*/g, '$1');
  const m = /^"([^"]*)"$/.exec(t);
  if (m) t = m[1];
  return t;
}

/**
 * The text of the `@default` (or `@defaultValue`) TSDoc tag of a prop, `undefined` when there is none (a bare tag
 * is `''`). Read from the property symbol of the component's props type (every member of a union), else from the
 * interface / type alias the docgen reports as the prop's declaration.
 *
 * `@defaultValue` (the TSDoc spelling) is read too, so that its value is still compared with the source, but the
 * docgen ignores it (the Default column stays empty): `check` reports it as `wrong-tag` ("use `@default`") rather
 * than as a missing tag, which would be false. See `declaredTagOf` for the tag name.
 */
export function declaredDefaultOf(name, fn, propInfo, program, checker) {
  return declaredTagOf(name, fn, propInfo, program, checker)?.text;
}

/** `{ text, tag }` of the prop's `@default` / `@defaultValue` tag (`tag` is the name written), `undefined` when none. */
export function declaredTagOf(name, fn, propInfo, program, checker) {
  const fromSymbol = (sym) => {
    // The prop's own declarations only: `symbol.getJsDocTags()` also inherits the tags of a prop it overrides
    // (Radix's `loop` has `@default false`), which the docgen does not show for the redeclared prop either.
    for (const d of sym?.declarations ?? []) {
      const tag = ts.getJSDocTags(d).find((t) => t.tagName.text === 'default' || t.tagName.text === 'defaultValue');
      if (tag) return { text: ts.getTextOfJSDocComment(tag.comment) ?? '', tag: tag.tagName.text };
    }
    return undefined;
  };
  const param = fn?.parameters[0];
  if (param) {
    const type = checker.getTypeAtLocation(param);
    for (const t of type.isUnion() ? type.types : [type]) {
      const found = fromSymbol(checker.getPropertyOfType(t, name));
      if (found !== undefined) return found;
    }
  }
  for (const decl of propInfo.declarations ?? []) {
    const sf = program.getSourceFile(decl.fileName);
    if (!sf) continue;
    let found;
    const visit = (node) => {
      if (found !== undefined) return;
      if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name.text === decl.name) {
        const members = ts.isInterfaceDeclaration(node) ? node.members : ts.isTypeLiteralNode(node.type) ? node.type.members : [];
        for (const m of members) if (m.name && ts.isIdentifier(m.name) && m.name.text === name) found = fromSymbol(checker.getSymbolAtLocation(m.name));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Defaults written as a fallback in the body of the public component: `prop ?? x`, `props.prop ?? x`,
 * `rest.prop ?? x` and `prop || <literal>` (the prop read unchanged, see `propsScope`). Map prop ->
 * `{ text, literal, where: 'fallback', node }`; `node` is the fallback value (`undefined` when two fallbacks of the
 * same prop disagree, which `check` treats as not comparable).
 *
 * Only used to VERIFY a declared default (a `@default` tag, or a default stated in the prose), never to create a
 * row on its own: `x || y` is often a boolean or (`disabled || readOnly`, `aria-disabled={disabled || undefined}`)
 * and `x ?? y` an expression local to one place, not the default of the prop. For `||` only a literal right side
 * other than `undefined`, `null` and `false` counts; `x ?? undefined` does not count either. Read in the public
 * component only, not in the components it delegates to: there a declared default with no other source needs an
 * allowlist entry (explicit, never silent).
 */
export function fallbackDefaults(fn, checker) {
  const found = new Map();
  if (!fn?.body) return new Map();
  const scope = propsScope(fn, checker);
  const nothing = (n) => (ts.isIdentifier(n) && n.text === 'undefined') || n.kind === ts.SyntaxKind.NullKeyword || n.kind === ts.SyntaxKind.FalseKeyword;
  const visit = (n) => {
    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind;
      const right = unwrap(n.right);
      const name = (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) && scope.propOf(n.left);
      const counts =
        name &&
        !(ts.isIdentifier(right) && right.text === 'undefined') &&
        (op === ts.SyntaxKind.QuestionQuestionToken || (literalNodeOf(right, checker) && !nothing(unwrap(literalNodeOf(right, checker)))));
      if (counts) found.set(name, [...(found.get(name) ?? []), n]);
    }
    ts.forEachChild(n, visit);
  };
  visit(fn.body);
  const out = new Map();
  for (const [name, list] of found) {
    const values = new Set(list.map((b) => { const l = literalNodeOf(b.right, checker); return l ? normalizeDefault(l.getText()) : `?${b.right.getText()}`; }));
    const texts = [...new Set(list.map((b) => b.getText().replace(/\s+/g, ' ')))];
    const agree = values.size === 1;
    out.set(name, { text: texts.join(' / '), literal: agree && isLiteralInitializer(list[0].right), where: 'fallback', node: agree ? list[0].right : undefined });
  }
  return out;
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
    const fallbacks = fn ? fallbackDefaults(fn, checker) : new Map();
    const shape = !fn ? 'not-found' : ts.isFunctionDeclaration(fn) ? 'function' : 'wrapped/arrow';
    const rows = [];
    const inTable = new Set(Object.keys(doc.props));
    for (const [name, prop] of Object.entries(doc.props)) {
      // `declared` is `undefined` only when there is no tag: a bare, empty or falsy `@default` is still declared.
      // The docgen swallows the tag into `defaultValue` (and loses it when the source has a default too), so it
      // is read from the TSDoc of the prop itself.
      const tag = declaredTagOf(name, fn, prop, program, checker);
      const declared = tag?.text;
      const tagValued = declared !== undefined && declared.trim() !== '';
      const own = defaults.get(name);
      const src = own ?? delegated.out.get(name);
      // A fallback (`size ?? 'md'`) only verifies a declared default; it never makes a row by itself.
      const fb = src ? undefined : fallbacks.get(name);
      const cmp = src ?? fb;
      const hasSource = src !== undefined || tagValued;
      const emptyCol = prop.defaultValue == null;
      const source = cmp ? cmp.text : `@default ${declared}`;
      const literal = cmp ? cmp.literal : true;
      const where = src ? src.where : fb ? 'fallback' : 'tag';
      const union = unionCause(sf, name) === 'union';
      // `proseValue`: the value the prose states (`"Loading"`), for messages and for the simulation of #475 in the tests.
      const proseValue = proseDefaultOf(prop.description ?? '');
      const prose = proseValue !== undefined;
      // The comparable value of the source default; `null` when it cannot be resolved to a literal.
      const lit = cmp?.node && literalNodeOf(cmp.node, checker);
      const sourceValue = lit ? normalizeDefault(lit.getText()) : null;
      // A default of the public component and a different one in the internal component it hands the prop to.
      const inner = own && delegated.out.get(name);
      const innerLit = inner?.node && literalNodeOf(inner.node, checker);
      const innerValue = inner ? (innerLit ? normalizeDefault(innerLit.getText()) : inner.text) : null;
      const ownValue = own ? (sourceValue ?? own.text) : null;
      const divergence = inner && innerValue !== ownValue ? { own: own.text, inner: inner.text, via: inner.via } : undefined;
      // `sourceLiteral`: the literal a constant or a fallback resolves to, for the messages (`LIMIT (= 5)`).
      const extra = { declared, declaredTag: tag?.tag, sourceValue, sourceLiteral: lit ? lit.getText() : undefined, prose, ...(prose ? { proseValue } : {}), ...(divergence ? { divergence } : {}) };
      if (hasSource && emptyCol) rows.push({ prop: name, kind: 'gap', source, literal, where, union, cause: causeOf(src, fn, sf), via: src?.via, ...extra });
      else if (!hasSource && emptyCol && prose) rows.push({ prop: name, kind: 'prose-only', source: fb ? fb.text : '(prose in TSDoc)', literal: false, where: fb ? 'fallback' : 'none', cause: 'other', ...extra });
      else if (hasSource) rows.push({ prop: name, kind: 'ok', source, literal, where, union, cause: '', ...extra });
      // No destructuring default but the column is filled: the docgen read a `@default` tag (it does).
      else if (!emptyCol) rows.push({ prop: name, kind: 'ok', source: `@default ${prop.defaultValue.value}`, literal: true, where: 'tag', union, cause: '', ...extra });
      // A bare `@default` (no value, no source default): the row exists so that `check` can name it.
      else if (declared !== undefined) rows.push({ prop: name, kind: 'ok', source: '@default', literal: true, where: 'tag', union, cause: '', ...extra });
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

/**
 * Props whose documented default cannot be compared with the source, with the reason that is fine. A prop needs
 * an entry when it has a default (in the source, in a `@default` tag or in the prose) and the script cannot read
 * it as a literal:
 * - the source default is computed (a function reference, a call, `a ?? b` with `b` not a literal);
 * - the source has no default the script can read: a default of node_modules (Radix), a value derived elsewhere
 *   (`clampLevel(headingLevel)`, `searchPlaceholder ?? searchLabel` in the JSX), or `undefined` that the code
 *   reads as `false` / as a named variant.
 * Without an entry a `@default` on such a prop is an error (`non-literal` / `unverified-default`): the value would
 * be published unverified. Key `Component.prop`. `check` fails when an entry is no longer needed (the prop is
 * gone, its default has become comparable, or nothing documents a default any more), so the list can only shrink.
 * The entries for the props that today state their default only in the prose are prepared for #475, which will
 * turn the prose into `@default` tags.
 */
const RADIX = 'a default of the Radix primitive (node_modules) the prop is handed to unchanged: invisible to this script';
const ROW_ACTIONS = 'the default `0` is in `ListReportTableRow`, reached through the list report context, which the script does not follow';
export const UNCOMPARABLE_ALLOWLIST = {
  'Accordion.headingLevel': 'computed: `clampLevel(headingLevel)` turns `undefined` into 3, there is no literal default in the source',
  'Accordion.orientation': RADIX,
  'DescriptionListItem.variant': 'no value is assigned: `undefined` (like any unknown value) renders as `default`',
  'Field.required': 'no value is assigned: `undefined` is read as `false` (`if (required)`)',
  'ListReport.onClearFilters': 'the default is a behaviour (`onClearFilters ?? clearFilters` in `ListReportFrame`), not a literal',
  'ListReport.rowActionsInline': ROW_ACTIONS,
  'ListReportFilterBar.searchPlaceholder': 'derived from another prop: `searchPlaceholder ?? searchLabel`',
  'ListReportTable.errorMessage': 'derived from `labels.error` (`ListReportTableStates`), not a literal',
  'ListReportTable.rowActionsInline': ROW_ACTIONS,
  'MenuContent.alignOffset': RADIX,
  'MenuContent.arrowPadding': RADIX,
  'MenuContent.avoidCollisions': RADIX,
  'MenuContent.hideWhenDetached': RADIX,
  'MenuContent.sticky': RADIX,
  'MenuContent.updatePositionStrategy': RADIX,
  'MenuItem.disabled': RADIX,
  'MessageStrip.dismissLabel': 'derived from the title: `dismissLabel ?? "Dismiss message: <title>"`',
  'MultiSelect.defaultValue': 'computed: `uniqueValues(undefined)` is the empty array, there is no literal default in the source',
  'NumberInput.step': 'computed: `normalizeStep(undefined)` is 1, there is no literal default in the source',
  'ObjectPageFooter.toneLabel': 'derived from the tone: `toneLabel ?? TONE_LABEL[messageTone]`',
  'Pagination.boundaryCount': 'computed: `toInt(boundaryCount, 1, 0)` turns `undefined` into 1, there is no literal default in the source',
  'Pagination.siblingCount': 'computed: `toInt(siblingCount, 1, 0)` turns `undefined` into 1, there is no literal default in the source',
  'ProgressBar.getValueLabel': 'the default is a function reference (`defaultValueLabel`), there is no literal to compare',
  'Tabs.activationMode': RADIX,
  'VirtualListReport.onClearFilters': 'the default is a behaviour (`onClearFilters ?? clearFilters` in `ListReportFrame`), not a literal',
  'VirtualListReport.rowActionsInline': ROW_ACTIONS,
  'VirtualListReportTable.errorMessage': 'derived from `labels.error` (`ListReportTableStates`), not a literal',
  'VirtualListReportTable.rowActionsInline': ROW_ACTIONS,
};

/** The kinds of `where` that are a default in the source (`tag` and `none` are not). */
const SOURCE_WHERE = new Set(['param', 'body', 'delegated', 'fallback']);

/**
 * The guard (`--check`): every problem as `{ component, prop, kind, message }`, sorted, empty when the Default
 * column is complete and coherent. Threshold 0, no baseline.
 * - `missing-default`: a default in the source (or only in prose) and no `@default` / Default in the docgen;
 * - `mismatch`: `@default X` and a different default `Y` in the source (after normalisation; a constant or a
 *   fallback is shown with the literal it resolves to);
 * - `redundant-prose`: a `@default` and the same information repeated in the prose;
 * - `empty-default`: a `@default` tag without a value;
 * - `wrong-tag`: `@defaultValue`, which the docgen does not read (the Default column stays empty): use `@default`;
 * - `unread-tag`: a `@default` the docgen did not show (the Default column is empty although the tag is there,
 *   e.g. a tag in a union branch the docgen does not read);
 * - `non-literal`: a `@default` against a source default that cannot be resolved and is not in the allowlist;
 * - `unverified-default`: a `@default` with no default the script can read in the source, not in the allowlist;
 * - `stale-allowlist`: an allowlist entry that is not needed any more;
 * - `divergent-default`: the public component and the internal one it delegates to default the prop differently
 *   (the public one wins; the divergence is reported, never silent);
 * - `unresolved-delegation`: a delegation the script could not follow (the guard would be blind there).
 */
export function check({ components }, { allowlist = UNCOMPARABLE_ALLOWLIST } = {}) {
  const issues = [];
  const needed = new Set();
  const push = (component, prop, kind, message) => issues.push({ component, prop, kind, message });
  const flat = (t) => t.replace(/\s+/g, ' ').trim();
  for (const c of components) {
    for (const r of c.rows) {
      const id = `${c.component}.${r.prop}`;
      const tagValued = r.declared !== undefined && r.declared.trim() !== '';
      const inSource = SOURCE_WHERE.has(r.where);
      // A bare `@default` has its own error below; it must not also be called missing.
      if (r.kind === 'gap' && r.declared === undefined) push(c.component, r.prop, 'missing-default', `default ${flat(r.source)} in the source, no \`@default\` tag`);
      else if (r.kind === 'prose-only') push(c.component, r.prop, 'missing-default', 'default only in the prose, no `@default` tag');
      // A documented or written default that cannot be compared: it needs an allowlist entry.
      const uncomparable = r.sourceValue === null && (inSource || tagValued || r.prose);
      if (uncomparable) needed.add(id);
      if (r.divergence) push(c.component, r.prop, 'divergent-default', `public default ${flat(r.divergence.own)}, ${r.divergence.via} defaults it to ${flat(r.divergence.inner)} (the public one wins)`);
      if (r.declared === undefined) continue;
      if (r.declaredTag === 'defaultValue') push(c.component, r.prop, 'wrong-tag', '`@defaultValue` is not read by the docgen (the Default column stays empty): write `@default`');
      else if (r.kind === 'gap' && tagValued) push(c.component, r.prop, 'unread-tag', `\`@default ${flat(r.declared)}\` is not shown by the docgen (the Default column is empty): put the tag on the declaration of the prop the docgen documents`);
      if (r.declared.trim() === '') push(c.component, r.prop, 'empty-default', "`@default` without a value (write `''` for an empty string)");
      else if (r.sourceValue !== null && normalizeDefault(r.declared) !== r.sourceValue) {
        const resolved = r.sourceLiteral !== undefined && normalizeDefault(r.source) !== r.sourceValue ? ` (= ${flat(r.sourceLiteral)})` : '';
        push(c.component, r.prop, 'mismatch', `\`@default ${flat(r.declared)}\` but the source default is ${flat(r.source)}${resolved}`);
      } else if (uncomparable && !(id in allowlist)) {
        if (inSource) push(c.component, r.prop, 'non-literal', `\`@default ${flat(r.declared)}\` against a source default that is not a literal (${flat(r.source)}): resolve it or add it to the allowlist with a reason`);
        else push(c.component, r.prop, 'unverified-default', `\`@default ${flat(r.declared)}\` but the script finds no default in the source to compare it with (a default of node_modules, a value computed elsewhere): add it to the allowlist with a reason`);
      }
      if (r.prose) push(c.component, r.prop, 'redundant-prose', 'the default is in `@default` and repeated in the prose: remove the prose');
    }
    for (const u of c.unresolvedDelegations) push(c.component, u, 'unresolved-delegation', `delegation to ${u} cannot be followed`);
  }
  for (const id of Object.keys(allowlist)) {
    if (!needed.has(id)) push(id.split('.')[0], id.split('.')[1] ?? '', 'stale-allowlist', `allowlist entry ${id} is not needed any more (${allowlist[id]})`);
  }
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return issues.sort((a, b) => order(a.component, b.component) || order(a.prop, b.prop) || order(a.kind, b.kind) || order(a.message, b.message));
}

export function formatCheck(issues) {
  if (!issues.length) return 'Default column check: OK\n';
  return [...issues.map((i) => `${i.component}.${i.prop} [${i.kind}] ${i.message}`), '', `Default column check: ${issues.length} problem${issues.length === 1 ? '' : 's'}`].join('\n') + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // `--root <dir>`: measure another package tree (the tests run the CLI on fixture packages).
  const rootAt = process.argv.indexOf('--root');
  const result = rootAt > 0 ? measure({ root: resolve(process.argv[rootAt + 1]) }) : measure();
  const json = process.argv.includes('--json');
  if (process.argv.includes('--check')) {
    // The allowlist names props of this repository: another root has none.
    const issues = rootAt > 0 ? check(result, { allowlist: {} }) : check(result);
    process.stdout.write(json ? JSON.stringify(issues, null, 2) + '\n' : formatCheck(issues));
    process.exitCode = issues.length ? 1 : 0;
  } else process.stdout.write(json ? JSON.stringify(result, null, 2) + '\n' : format(result));
}
