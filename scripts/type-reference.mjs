// Reference of the public hooks, functions and types, generated from the TSDoc of the sources (ticket #402).
//
// Reads the public entries of the packages (`packages/core/src/index.ts`, `packages/pro/src/index.ts`) with
// the TypeScript compiler API (already a devDependency: no TypeDoc, no second pipeline) and returns a plain
// JSON object that the MDX blocks of `.storybook/blocks/TypeReference.tsx` render. The Storybook build
// generates it on demand (Vite plugin in `.storybook/type-reference-plugin.ts`, a virtual module): it is never
// written to the repo, so it cannot go stale. `findUndocumented` is the guard (scripts/type-reference.test.mjs).
//
// What one entry holds:
//   - an interface / type alias: its members (own and inherited), each with its type as written in the
//     source, whether it is optional, its default (`@default`, or "Default `x`" in the prose) and its TSDoc
//     as markdown. A union of object types is split into the members every branch shares plus one section
//     per branch (`AccordionProps`: single / multiple). A type with no members (a union of literals) keeps
//     its definition.
//   - a function (`useListReport`, `cn`, ...): its signature(s), parameters and return value, with the TSDoc.
// Left out: what is tagged `@internal`; members inherited from `@types/react` (the HTML/DOM attributes every
// component accepts, hundreds of rows with no project TSDoc: summarised by the `inherits` line instead, the
// same rule as the props tables of ticket #401); components (their props tables document them).
import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Bump when the shape of the JSON changes (the block checks it). */
export const REFERENCE_VERSION = 1;

/** The public entries of the packages, as `{ package, file }` (absolute `file`). */
export function publicEntries(root = REPO_ROOT, { pro = true } = {}) {
  const entries = [{ package: '@formrail/core', file: resolve(root, 'packages/core/src/index.ts') }];
  if (pro) entries.push({ package: '@formrail/pro', file: resolve(root, 'packages/pro/src/index.ts') });
  return entries;
}

/**
 * Compiler options: those of `tsconfig.base.json` (what both packages extend), plus `paths` that point the
 * Pro sources' `@formrail/core` imports at the core SOURCES (through the package entry they would resolve to
 * `dist/`, which is not built in every job, and the core types a Pro type inherits would be lost).
 */
export function referenceCompilerOptions(root = REPO_ROOT) {
  const configPath = resolve(root, 'tsconfig.base.json');
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  const { options } = ts.convertCompilerOptionsFromJson(config.compilerOptions, root);
  return {
    ...options,
    noEmit: true,
    types: [],
    paths: {
      '@formrail/core': [resolve(root, 'packages/core/src/index.ts')],
      '@formrail/core/internal': [resolve(root, 'packages/core/src/internal.ts')],
    },
  };
}

/** A TypeScript program over the entries. Pass the previous one to reuse its unchanged files (dev server). */
export function createReferenceProgram(entries, { compilerOptions = referenceCompilerOptions(), oldProgram } = {}) {
  return ts.createProgram({ rootNames: entries.map((e) => e.file), options: compilerOptions, oldProgram });
}

// ---------------------------------------------------------------------------------------------------------
// TSDoc helpers

const normalise = (text) => text.replace(/\r\n/g, '\n').trim();

/** Display parts as markdown: `{@link X}` / `{@linkcode X}` become the code span `X`. */
function partsToMarkdown(parts) {
  if (!parts) return '';
  let out = '';
  let inLink = false;
  let linkText = '';
  for (const part of parts) {
    if (part.kind === 'link') {
      if (part.text.startsWith('{@link')) {
        inLink = true;
        linkText = '';
      } else if (part.text === '}') {
        inLink = false;
        out += `\`${linkText.trim()}\``;
      }
      continue;
    }
    if (inLink) {
      // `linkName` (the target) and `linkText` (the optional label): the label wins when present.
      if (part.kind === 'linkText') linkText = part.text;
      else if (!linkText) linkText = part.text;
      continue;
    }
    out += part.text;
  }
  return normalise(out);
}

/** The text of a JSDoc tag as markdown (`@default`, `@deprecated`, `@returns`, ...). */
const tagText = (tag) => partsToMarkdown(tag.text);

const hasTag = (tags, name) => tags.some((t) => t.name === name);

/** Tags of a declaration node (not of the symbol: an alias would merge the tags of its target). */
const nodeTags = (node) => ts.getJSDocTags(node).map((t) => ({ name: t.tagName.text, text: t.comment }));

const isInternalNode = (node) => nodeTags(node).some((t) => t.name === 'internal');

const CODE_SPAN = /^`([^`]+)`/;
const TOKEN = /^(-?\d[\w.%]*|true|false|null|undefined|yes|no)\b/;
// "Default `x`", "Default: `x`", "Default 300;", "(default 120px)", "(default: yes)": at the start of a
// sentence or after an opening parenthesis, so "defaults to `defaultFilter`, else the first" is not mistaken
// for one (its value is a rule, said in the description).
const PROSE_DEFAULT = /(?:^|[.;:!?]\s+|\n\s*|\(\s*)(?:Default|default)(?:\s+is)?:?\s+/g;

/**
 * The default of a member: its `@default` tag, else the first "Default `x`" / "Default 300" of its prose.
 * `undefined` when neither says it as a value (a default described in words stays in the description).
 */
export function defaultOf(description, tags = []) {
  const tag = tags.find((t) => t.name === 'default' || t.name === 'defaultValue');
  if (tag) {
    const text = tagText(tag);
    if (text) return CODE_SPAN.exec(text)?.[1] ?? text;
  }
  for (const match of description.matchAll(PROSE_DEFAULT)) {
    const rest = description.slice(match.index + match[0].length);
    const value = CODE_SPAN.exec(rest)?.[1] ?? TOKEN.exec(rest)?.[1];
    if (value) return value;
  }
  return undefined;
}

/** `@example` / `@deprecated` / ... that the reference renders, as markdown. */
function extraDocs(tags) {
  const out = {};
  const deprecated = tags.find((t) => t.name === 'deprecated');
  if (deprecated) out.deprecated = tagText(deprecated) || 'Deprecated.';
  const examples = tags.filter((t) => t.name === 'example').map(tagText).filter(Boolean);
  if (examples.length > 0) out.examples = examples;
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Extraction

const isReactTypesFile = (file) => /[\\/]node_modules[\\/]@types[\\/]react[\\/]/.test(file);
const isProjectFile = (file) => !/[\\/]node_modules[\\/]/.test(file);

/** Whitespace of a type as written in the source, collapsed onto one line. */
const oneLine = (text) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/,\s*\)/g, ')')
    .replace(/;\s*}/g, ' }')
    .trim();

const PRINT_FLAGS = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinitionsOutsideCurrentScope;

class Extractor {
  constructor(program, root) {
    this.program = program;
    this.checker = program.getTypeChecker();
    this.root = root;
  }

  location(node) {
    const file = node.getSourceFile();
    const { line } = file.getLineAndCharacterOfPosition(node.getStart());
    return `${relative(this.root, file.fileName).split('\\').join('/')}:${line + 1}`;
  }

  docsOf(symbol, node) {
    const description = partsToMarkdown(symbol.getDocumentationComment(this.checker));
    const tags = symbol.getJsDocTags(this.checker);
    return { description, tags, node };
  }

  /** The type of a member as written in its declaration; the checker's printout when there is none. */
  memberType(symbol, declaration, location) {
    if (declaration) {
      if ((ts.isPropertySignature(declaration) || ts.isPropertyDeclaration(declaration)) && declaration.type) {
        return oneLine(declaration.type.getText());
      }
      if (ts.isMethodSignature(declaration) || ts.isMethodDeclaration(declaration)) {
        const typeParameters = declaration.typeParameters ? `<${declaration.typeParameters.map((p) => p.getText()).join(', ')}>` : '';
        const params = declaration.parameters.map((p) => p.getText()).join(', ');
        const returns = declaration.type ? declaration.type.getText() : 'void';
        return oneLine(`${typeParameters}(${params}) => ${returns}`);
      }
    }
    const type = this.checker.getTypeOfSymbolAtLocation(symbol, location);
    let text = this.checker.typeToString(type, location, PRINT_FLAGS);
    if (symbol.flags & ts.SymbolFlags.Optional) text = text.replace(/ \| undefined$/, '');
    return text;
  }

  /** The members of an object type: `{ members, external }`, `external` = how many came from `@types/react`. */
  members(type, ownerName, location) {
    const members = [];
    let external = 0;
    for (const symbol of this.checker.getPropertiesOfType(type)) {
      const declarations = symbol.declarations ?? [];
      if (declarations.length > 0 && declarations.every((d) => isReactTypesFile(d.getSourceFile().fileName))) {
        external += 1;
        continue;
      }
      // The project's own declaration when there is one (a prop redeclared over an HTML attribute).
      const declaration = declarations.find((d) => isProjectFile(d.getSourceFile().fileName)) ?? declarations[0];
      if (declaration && isInternalNode(declaration)) continue;
      const { description, tags } = this.docsOf(symbol, declaration);
      if (hasTag(tags, 'internal')) continue;
      const parent = declaration?.parent;
      const declaredIn =
        parent && (ts.isInterfaceDeclaration(parent) || ts.isClassDeclaration(parent))
          ? parent.name?.text
          : parent && ts.isTypeLiteralNode(parent) && ts.isTypeAliasDeclaration(parent.parent)
            ? parent.parent.name.text
            : undefined;
      const member = {
        name: symbol.name,
        type: this.memberType(symbol, declaration, location),
        optional: (symbol.flags & ts.SymbolFlags.Optional) !== 0,
        description,
        ...extraDocs(tags),
      };
      const fallback = defaultOf(description, tags);
      if (fallback !== undefined) member.default = fallback;
      if (declaredIn && declaredIn !== ownerName) member.inheritedFrom = declaredIn;
      if (declaration) member.source = this.location(declaration);
      members.push(member);
    }
    return { members, external };
  }

  /**
   * The bases written in the declaration whose members come from a dependency's DOM types
   * (`ComponentPropsWithoutRef<'div'>`, `Omit<ButtonHTMLAttributes<...>, 'type'>`), followed through the
   * project's own bases: the "also accepts" line of a type whose `@types/react` members are not listed.
   */
  externalBases(declaration, seen = new Set()) {
    if (seen.has(declaration)) return [];
    seen.add(declaration);
    const out = [];
    const visitTypeNode = (node) => {
      if (ts.isParenthesizedTypeNode(node)) return visitTypeNode(node.type);
      if (ts.isIntersectionTypeNode(node) || ts.isUnionTypeNode(node)) return node.types.forEach(visitTypeNode);
      if (ts.isTypeReferenceNode(node) || ts.isExpressionWithTypeArguments(node)) {
        const nameNode = ts.isTypeReferenceNode(node) ? node.typeName : node.expression;
        let symbol = this.checker.getSymbolAtLocation(nameNode);
        if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
        const decl = symbol?.declarations?.[0];
        if (!decl) return;
        const file = decl.getSourceFile().fileName;
        const name = ts.isTypeReferenceNode(node) ? node.typeName.getText() : node.expression.getText();
        if (['Omit', 'Pick', 'Partial', 'Required', 'Readonly'].includes(name)) {
          const inner = node.typeArguments?.[0];
          if (inner && this.externalBases(inner, seen).length > 0) out.push(oneLine(node.getText()));
          return;
        }
        if (isReactTypesFile(file)) out.push(oneLine(node.getText()));
        else if (isProjectFile(file)) out.push(...this.externalBases(decl, seen));
      }
    };
    if (ts.isInterfaceDeclaration(declaration)) {
      for (const clause of declaration.heritageClauses ?? []) clause.types.forEach(visitTypeNode);
    } else if (ts.isTypeAliasDeclaration(declaration)) {
      visitTypeNode(declaration.type);
    } else if (ts.isTypeNode(declaration)) {
      visitTypeNode(declaration);
    }
    return [...new Set(out)];
  }

  isObjectLike(type) {
    if (type.flags & (ts.TypeFlags.Primitive | ts.TypeFlags.Literal | ts.TypeFlags.Never | ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;
    if (type.isUnion()) return false;
    if (this.checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0 && this.checker.getPropertiesOfType(type).length === 0) return false;
    return this.checker.getPropertiesOfType(type).length > 0;
  }

  typeEntry(name, pkg, symbol, declaration) {
    const checker = this.checker;
    const { description, tags } = this.docsOf(symbol, declaration);
    const entry = {
      name,
      package: pkg,
      kind: ts.isInterfaceDeclaration(declaration) ? 'interface' : 'type',
      typeParameters: declaration.typeParameters ? declaration.typeParameters.map((p) => oneLine(p.getText())) : [],
      description,
      ...extraDocs(tags),
      source: this.location(declaration),
    };
    const type = checker.getDeclaredTypeOfSymbol(symbol);
    const location = declaration.name;

    if (type.isUnion() && !(type.flags & ts.TypeFlags.Boolean)) {
      const objectBranches = type.types.filter((t) => this.isObjectLike(t));
      const otherBranches = type.types.filter((t) => !this.isObjectLike(t));
      if (objectBranches.length === 0) {
        entry.definition = oneLine(declaration.type.getText());
        return entry;
      }
      const branches = objectBranches.map((t) => ({ type: t, ...this.members(t, name, location) }));
      // Shared = the same member (same name and type) in every branch.
      const key = (m) => `${m.name}\u0000${m.type}\u0000${m.optional}`;
      const shared = branches[0].members.filter((m) => branches.every((b) => b.members.some((o) => key(o) === key(m))));
      const sharedKeys = new Set(shared.map(key));
      entry.members = branches.length > 1 ? shared : branches[0].members;
      if (branches.length > 1) {
        entry.variants = branches.map((b, index) => {
          const alias = b.type.aliasSymbol ?? (b.type.symbol && !(b.type.symbol.flags & ts.SymbolFlags.TypeLiteral) ? b.type.symbol : undefined);
          const own = b.members.filter((m) => !sharedKeys.has(key(m)));
          const variant = { title: alias && alias.name !== '__type' ? alias.name : `Variant ${index + 1}`, members: own };
          // What tells this branch apart, for a branch with no name of its own: its required members
          // (`never` ones are the members the branch forbids, not requires).
          const requires = own.filter((m) => !m.optional && m.type !== 'never').map((m) => m.name);
          if (requires.length > 0) variant.requires = requires;
          return variant;
        });
      }
      if (otherBranches.length > 0) entry.otherVariants = otherBranches.map((t) => checker.typeToString(t, location, PRINT_FLAGS));
      const external = Math.max(...branches.map((b) => b.external));
      if (external > 0) entry.inherits = this.externalBases(declaration);
      return entry;
    }

    if (this.isObjectLike(type) || ts.isInterfaceDeclaration(declaration)) {
      const { members, external } = this.members(type, name, location);
      entry.members = members;
      if (external > 0) entry.inherits = this.externalBases(declaration);
      // A function type with properties (rare) or an alias of a function type: keep the definition too.
      if (!ts.isInterfaceDeclaration(declaration) && members.length === 0) entry.definition = oneLine(declaration.type.getText());
      return entry;
    }

    entry.definition = oneLine(declaration.type.getText());
    return entry;
  }

  functionEntry(name, pkg, symbol, declaration) {
    const checker = this.checker;
    const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
    const { description, tags } = this.docsOf(symbol, declaration);
    const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call).map((signature) => {
      const sigDecl = signature.getDeclaration();
      const typeParameters = sigDecl?.typeParameters ? sigDecl.typeParameters.map((p) => oneLine(p.getText())) : [];
      const sigTags = signature.getJsDocTags();
      const parameters = signature.getParameters().map((param) => {
        const paramDecl = param.valueDeclaration;
        const text = paramDecl && ts.isParameter(paramDecl) && paramDecl.type ? oneLine(paramDecl.type.getText()) : checker.typeToString(checker.getTypeOfSymbolAtLocation(param, declaration), declaration, PRINT_FLAGS);
        const paramDescription = partsToMarkdown(param.getDocumentationComment(checker));
        const out = {
          name: param.name,
          type: text,
          optional: Boolean(paramDecl && ts.isParameter(paramDecl) && (paramDecl.questionToken || paramDecl.initializer || paramDecl.dotDotDotToken)),
          description: paramDescription,
        };
        if (paramDecl && ts.isParameter(paramDecl) && paramDecl.dotDotDotToken) out.rest = true;
        const fallback = paramDecl && ts.isParameter(paramDecl) && paramDecl.initializer ? oneLine(paramDecl.initializer.getText()) : defaultOf(paramDescription);
        if (fallback !== undefined) out.default = fallback;
        return out;
      });
      const returnType =
        sigDecl && 'type' in sigDecl && sigDecl.type ? oneLine(sigDecl.type.getText()) : checker.typeToString(signature.getReturnType(), declaration, PRINT_FLAGS);
      const returnsTag = sigTags.find((t) => t.name === 'returns' || t.name === 'return');
      const signatureText = `${name}${typeParameters.length ? `<${typeParameters.join(', ')}>` : ''}(${parameters
        .map((p) => `${p.rest ? '...' : ''}${p.name}${p.optional && !p.rest ? '?' : ''}: ${p.type}`)
        .join(', ')}): ${returnType}`;
      return {
        signature: signatureText,
        typeParameters,
        parameters,
        returns: { type: returnType, description: returnsTag ? tagText(returnsTag) : '' },
      };
    });
    return {
      name,
      package: pkg,
      kind: 'function',
      description,
      ...extraDocs(tags),
      source: this.location(declaration),
      signatures,
    };
  }

  /** The entries of one public module. */
  extractModule(entry) {
    const file = this.program.getSourceFile(entry.file);
    if (!file) throw new Error(`type-reference: ${entry.file} is not part of the program`);
    const moduleSymbol = this.checker.getSymbolAtLocation(file);
    if (!moduleSymbol) return [];
    const out = [];
    for (const exported of this.checker.getExportsOfModule(moduleSymbol)) {
      const symbol = exported.flags & ts.SymbolFlags.Alias ? this.checker.getAliasedSymbol(exported) : exported;
      const name = exported.name;
      const declarations = symbol.declarations ?? [];
      // `@internal` on the export itself or on the declaration.
      if ((exported.declarations ?? []).some(isInternalNode) || declarations.some(isInternalNode)) continue;
      const typeDecl = declarations.find((d) => ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d));
      if (typeDecl) {
        out.push(this.typeEntry(name, entry.package, symbol, typeDecl));
        continue;
      }
      // Components (PascalCase values) are documented by their props tables, not here.
      if (/^[A-Z]/.test(name)) continue;
      const valueDecl = declarations.find((d) => ts.isFunctionDeclaration(d) || ts.isVariableDeclaration(d));
      if (!valueDecl) continue;
      const type = this.checker.getTypeOfSymbolAtLocation(symbol, valueDecl);
      if (this.checker.getSignaturesOfType(type, ts.SignatureKind.Call).length === 0) continue;
      out.push(this.functionEntry(name, entry.package, symbol, valueDecl));
    }
    return out;
  }
}

/**
 * The reference of the given public entries: `{ version, entries: { [name]: entry } }`, entries sorted by
 * name. Throws when two packages export the same name (the blocks look entries up by name).
 */
export function extractReference(program, entries, { root = REPO_ROOT } = {}) {
  const extractor = new Extractor(program, root);
  const byName = {};
  for (const entry of entries) {
    if (!existsSync(entry.file)) throw new Error(`type-reference: missing entry ${entry.file}`);
    for (const item of extractor.extractModule(entry)) {
      if (byName[item.name] && byName[item.name].package !== item.package) {
        throw new Error(`type-reference: ${item.name} is exported by both ${byName[item.name].package} and ${item.package}`);
      }
      byName[item.name] = item;
    }
  }
  // "Inherited from" names only a public type (one with its own entry): a base the package does not export
  // (`AccordionBaseProps`, `ListReportFrameLabels`) would be a name the reader can find nowhere.
  for (const item of Object.values(byName)) {
    for (const group of [item.members ?? [], ...(item.variants ?? []).map((v) => v.members)]) {
      for (const member of group) if (member.inheritedFrom && !byName[member.inheritedFrom]) delete member.inheritedFrom;
    }
  }
  const sorted = Object.fromEntries(Object.keys(byName).sort().map((name) => [name, byName[name]]));
  return { version: REFERENCE_VERSION, entries: sorted };
}

/** Program + extraction in one call (the guard, the CLI). */
export function generateReference({ root = REPO_ROOT, entries = publicEntries(root), oldProgram } = {}) {
  const program = createReferenceProgram(entries, { compilerOptions: referenceCompilerOptions(root), oldProgram });
  return { program, reference: extractReference(program, entries, { root }) };
}

// ---------------------------------------------------------------------------------------------------------
// Guard

/**
 * Every member of every public type, every parameter of a public function and every public function itself
 * must have a TSDoc description. Returns one message per gap, naming the type and the member.
 */
export function findUndocumented(reference) {
  const problems = [];
  for (const entry of Object.values(reference.entries)) {
    if (entry.kind === 'function') {
      if (!entry.description) problems.push(`${entry.name} (${entry.source}): the function has no TSDoc`);
      continue;
    }
    const groups = [{ title: null, members: entry.members ?? [] }, ...(entry.variants ?? [])];
    for (const group of groups) {
      for (const member of group.members) {
        if (member.description) continue;
        const where = group.title ? ` (${group.title})` : '';
        problems.push(`${entry.name}.${member.name}${where} (${member.source ?? entry.source}): member has no TSDoc`);
      }
    }
  }
  return [...new Set(problems)];
}

/** The stable part of a `findUndocumented` message (`Type.member` or `Type.member (Variant 2)`), without the source line. */
export const gapKey = (message) => message.replace(/ \((?:packages|node_modules)\/[^)]*\): .*$/, '');

/**
 * What must never reach a public page: the Pro-only `@formrail/core/internal` subpath, an inline
 * `import("...")` type (the checker's way of naming a type the entry does not import), an absolute path of
 * the build machine.
 */
export function findLeaks(reference, root = REPO_ROOT) {
  const problems = [];
  for (const entry of Object.values(reference.entries)) {
    const text = JSON.stringify(entry);
    if (text.includes('@formrail/core/internal')) problems.push(`${entry.name}: mentions @formrail/core/internal`);
    if (/\bimport\(/.test(text)) problems.push(`${entry.name}: has an inline import("...") type`);
    if (text.includes(root)) problems.push(`${entry.name}: has an absolute path of this machine`);
  }
  return problems;
}

// CLI: `node scripts/type-reference.mjs [--json]` prints the gaps (or the whole JSON).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = performance.now();
  const { reference } = generateReference();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(reference, null, 2)}\n`);
  } else {
    const problems = findUndocumented(reference);
    const count = Object.keys(reference.entries).length;
    console.log(`${count} entries in ${Math.round(performance.now() - started)} ms`);
    for (const problem of problems) console.log(problem);
    process.exitCode = problems.length > 0 ? 1 : 0;
  }
}
