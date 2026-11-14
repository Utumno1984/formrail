import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// A prop declared in several branches of a union (`FieldStateProps`, `ButtonProps`) is merged by the
// docgen: when the branches have different descriptive text, the Docs table shows it twice (#451).
// The `@` tags (`@default` on the optional branch only) are the one allowed difference.

const SRC = import.meta.dirname;

/**
 * Props whose branches deliberately describe the discriminant ("one item" / "the items"), which predate
 * #475. The Docs table already shows both texts for them: out of scope of the `@default` ticket. The
 * list can only shrink: an entry that no longer diverges fails the test.
 */
const KNOWN_DIVERGENT: Record<string, string> = {
  'accordion/Accordion.tsx: AccordionProps.type': 'single / multiple describe themselves',
  'accordion/Accordion.tsx: AccordionProps.value': 'one value / many values',
  'accordion/Accordion.tsx: AccordionProps.defaultValue': 'one value / many values',
  'accordion/Accordion.tsx: AccordionProps.onValueChange': 'one value / many values',
  'object-page/standard-schema.ts: StandardSchemaResult.issues': 'success branch / failure branch',
  'typography/Text.tsx: TextProps.as': 'the `label` branch is a different element',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|stories|example|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

interface Documented {
  name: string;
  /** Descriptive text of the TSDoc (no `@` tags), whitespace-normalised; `undefined` without TSDoc. */
  text: string | undefined;
}

function membersOf(members: ts.NodeArray<ts.TypeElement>): Documented[] {
  const out: Documented[] = [];
  for (const m of members) {
    if (!ts.isPropertySignature(m) || !m.name) continue;
    const doc = (m as ts.PropertySignature & { jsDoc?: ts.JSDoc[] }).jsDoc?.at(-1);
    const text = doc ? ts.getTextOfJSDocComment(doc.comment) : undefined;
    out.push({ name: m.name.getText(), text: text === undefined ? undefined : text.replace(/\s+/g, ' ').trim() });
  }
  return out;
}

/** One entry per way a type can be built: every union member is a separate branch, an intersection merges its parts. */
function branchesOf(node: ts.TypeNode, scope: Map<string, ts.Node>, seen: Set<string>): Documented[][] {
  if (ts.isParenthesizedTypeNode(node)) return branchesOf(node.type, scope, seen);
  if (ts.isUnionTypeNode(node)) return node.types.flatMap((t) => branchesOf(t, scope, seen));
  if (ts.isIntersectionTypeNode(node)) {
    return node.types.reduce<Documented[][]>(
      (acc, part) => {
        const partBranches = branchesOf(part, scope, seen);
        return acc.flatMap((a) => partBranches.map((b) => [...a, ...b]));
      },
      [[]],
    );
  }
  if (ts.isTypeLiteralNode(node)) return [membersOf(node.members)];
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    const name = node.typeName.text;
    const target = scope.get(name);
    if (!target || seen.has(name)) return [[]];
    const next = new Set(seen).add(name);
    if (ts.isTypeAliasDeclaration(target)) return branchesOf(target.type, scope, next);
    if (ts.isInterfaceDeclaration(target)) return [membersOf(target.members)];
  }
  return [[]];
}

/** `Type.prop: "text" vs "text"` for every prop whose branches (those with a TSDoc) describe it differently. */
export function divergences(code: string, fileName = 'case.tsx'): string[] {
  const file = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const scope = new Map<string, ts.Node>();
  for (const s of file.statements) if (ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s)) scope.set(s.name.text, s);
  const found: string[] = [];
  for (const [name, decl] of scope) {
    if (!ts.isTypeAliasDeclaration(decl)) continue;
    const branches = branchesOf(decl.type, scope, new Set([name]));
    if (branches.length < 2) continue;
    const byProp = new Map<string, Set<string>>();
    for (const branch of branches) {
      for (const p of branch) {
        if (p.text === undefined || p.text === '') continue;
        byProp.set(p.name, (byProp.get(p.name) ?? new Set()).add(p.text));
      }
    }
    for (const [prop, texts] of byProp) if (texts.size > 1) found.push(`${name}.${prop}: ${[...texts].map((t) => JSON.stringify(t)).join(' vs ')}`);
  }
  return found;
}

const lines = (...l: string[]) => l.join('\n');

describe('props defined in the branches of a union: the same descriptive text in every branch', () => {
  const all = sourceFiles(SRC).flatMap((path) => divergences(readFileSync(path, 'utf8'), path).map((d) => ({ id: `${relative(SRC, path)}: ${d.split(': ')[0]}`, text: d })));

  it('no prop of the core has branches with different descriptions (the docgen would show it twice)', () => {
    expect(all.filter((d) => !(d.id in KNOWN_DIVERGENT)).map((d) => `${d.id} -> ${d.text}`)).toEqual([]);
  });

  it('the list of the known divergences only shrinks', () => {
    expect(Object.keys(KNOWN_DIVERGENT).filter((id) => !all.some((d) => d.id === id))).toEqual([]);
  });

  it('Field.state and Button.size are checked and consistent', () => {
    const field = readFileSync(join(SRC, 'field/Field.tsx'), 'utf8');
    const button = readFileSync(join(SRC, 'button/Button.tsx'), 'utf8');
    expect(divergences(field)).toEqual([]);
    expect(divergences(button)).toEqual([]);
    // The check is not blind there: a reworded branch is seen.
    expect(divergences(field.replace('`default` (editable), `disabled`, `forced` (value decided by a business rule) or `locked` (not editable: permissions, record status). `forced` and `locked` are focusable but read-only.\n       * @default', 'Editable, `disabled`, `forced` or `locked`.\n       * @default'))).toContainEqual(expect.stringMatching(/^FieldStateProps\.state: /));
    expect(divergences(button.replace('Height scale (`sm` 32px', 'The scale (`sm` 32px'))).toContainEqual(expect.stringMatching(/^ButtonProps\.size: /));
  });

  it('a reworded first branch is a divergence, a `@default` tag alone is not', () => {
    const reworded = lines(
      'export type S =',
      '  | {',
      '      /**',
      '       * Editable.',
      "       * @default 'a'",
      '       */',
      "      state?: 'a';",
      '    }',
      '  | {',
      '      /** A (editable). */',
      "      state: 'b';",
      '    };',
    );
    expect(divergences(reworded)).toEqual([expect.stringMatching(/^S\.state: /)]);
    expect(divergences(reworded.replace('Editable.', 'A (editable).'))).toEqual([]);
  });

  it('follows a branch that is a named type and an intersection (Button.size shape)', () => {
    const code = lines(
      'type Name =',
      '  | {',
      '      /** The name. */',
      '      label: string;',
      '    }',
      '  | {',
      '      /** The name. */',
      '      label?: string;',
      '    };',
      'export type B =',
      '  | {',
      '      /** Size. */',
      "      size?: 'sm';",
      '    }',
      '  | ({',
      '      /** Size, reworded. */',
      "      size: 'icon';",
      '    } & Name);',
    );
    expect(divergences(code)).toEqual([expect.stringMatching(/^B\.size: /)]);
    expect(divergences(code.replace('Size, reworded.', 'Size.'))).toEqual([]);
  });
});
