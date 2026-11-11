import { resolve } from 'node:path';
import ts from 'typescript';
import { docgenCompilerOptions } from '../../.storybook/docgen';

// The props-table guard of the Docs pages (ticket #401): pure audit + the Node side that reads the real
// props types. Used by e2e/docs-props.spec.ts, which feeds it what the built Storybook's preview holds.

/** Category of the story args that are not props (packages/core/src/internal/story-docs.ts). */
export const STORY_CONTROLS = 'Story controls';

/** One component as the docgen saw it (`__docgenInfo`). */
export interface DocgenComponent {
  displayName: string;
  /** Repo-relative (main.ts strips the build machine's root from the bundle). */
  filePath: string;
  props: Record<string, { description: string }>;
}

/** One row of the Docs page's props table: an entry of the primary story's `argTypes`. */
export interface ArgTypeRow {
  name: string;
  category: string | null;
  disabled: boolean;
  description: string;
}

/** What a public Docs page puts in its props table. */
export interface DocsPageFacts {
  title: string;
  /** `null`: the meta has no `component`, or it has no docgen (a wrapper the docgen does not see). */
  component: DocgenComponent | null;
  subcomponents: Record<string, DocgenComponent | null>;
  rows: ArgTypeRow[];
}

/**
 * Every key of a component's props type, read from the TypeScript checker (not from the docgen, whose
 * filter drops the inherited HTML attributes): `Button`'s `disabled` is a real prop even though its row
 * comes from the story's argTypes. Unions contribute the keys of every member (`TableName`).
 */
export function createPropsTypeReader(repoRoot: string, components: DocgenComponent[]): (component: DocgenComponent) => Set<string> | string {
  const program = ts.createProgram([...new Set(components.map((c) => resolve(repoRoot, c.filePath)))], docgenCompilerOptions);
  const checker = program.getTypeChecker();
  return (component) => {
    const file = resolve(repoRoot, component.filePath);
    const source = program.getSourceFile(file);
    const moduleSymbol = source && checker.getSymbolAtLocation(source);
    if (!moduleSymbol) return `${component.filePath}: not a module the checker can read`;
    let symbol = checker.getExportsOfModule(moduleSymbol).find((s) => s.name === component.displayName);
    if (!symbol) return `${component.filePath}: no export named ${component.displayName}`;
    if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const type = checker.getTypeOfSymbolAtLocation(symbol, source);
    const keys = new Set<string>();
    for (const signature of type.getCallSignatures()) {
      const [props] = signature.getParameters();
      if (!props) continue;
      const propsType = checker.getTypeOfSymbolAtLocation(props, source);
      for (const member of propsType.isUnion() ? propsType.types : [propsType]) {
        for (const key of checker.getPropertiesOfType(checker.getApparentType(member))) keys.add(key.name);
      }
    }
    if (keys.size === 0) return `${component.filePath}: ${component.displayName} has no call signature with a props parameter`;
    return keys;
  };
}

export interface AuditOptions {
  /** Props type keys of a component (see createPropsTypeReader), or why they could not be read. */
  propsTypeKeys: (component: DocgenComponent) => Set<string> | string;
  /** Pages that document no component (a showcase, a hook, the foundations), with the reason. */
  pagesWithoutComponent: Readonly<Record<string, string>>;
  /** Props each listed component must show (the ones react-docgen used to lose). */
  requiredProps: Readonly<Record<string, readonly string[]>>;
}

/** The problems of one Docs page's props table; empty when the table tells the truth. */
export function auditDocsPage(page: DocsPageFacts, options: AuditOptions): string[] {
  const problems: string[] = [];
  const at = (text: string) => problems.push(`${page.title}: ${text}`);
  const withoutComponent = options.pagesWithoutComponent[page.title];

  const documented = [page.component, ...Object.values(page.subcomponents)].filter((c): c is DocgenComponent => c !== null);
  for (const [name, sub] of Object.entries(page.subcomponents)) {
    if (!sub) at(`subcomponent "${name}" has no docgen (not a component the docgen reads?)`);
  }
  for (const component of documented) {
    if (component.filePath.startsWith('/')) at(`${component.displayName}: absolute filePath "${component.filePath}" in the bundle`);
  }

  // (a) The page's component has a props table.
  if (withoutComponent !== undefined) {
    if (page.component) at(`listed as a page without component, but documents ${page.component.displayName}: drop it from the list`);
  } else if (!page.component) {
    at('no `component` with docgen: set the real component on the meta (or list the page as without component, with the reason)');
  } else if (Object.keys(page.component.props).length === 0) {
    at(`the props table of ${page.component.displayName} is empty`);
  }

  // Keys of the real props types of everything the page documents.
  const typeKeys = new Set<string>();
  for (const component of documented) {
    const keys = options.propsTypeKeys(component);
    if (typeof keys === 'string') at(keys);
    else keys.forEach((key) => typeKeys.add(key));
  }
  const docgenProps = new Map<string, string>();
  for (const component of documented) {
    for (const [key, prop] of Object.entries(component.props)) if (!docgenProps.has(key)) docgenProps.set(key, prop.description);
  }

  for (const row of page.rows) {
    if (row.disabled) continue;
    if (row.category === STORY_CONTROLS) {
      // (b') A real, documented prop filed as a demo knob would hide it from the props.
      if (page.component && Object.hasOwn(page.component.props, row.name)) {
        at(`"${row.name}" is a prop of ${page.component.displayName} but is filed under "${STORY_CONTROLS}"`);
      }
      if (!row.description.trim()) at(`story control "${row.name}" has no description (what it does, or which hook option it is)`);
      continue;
    }
    // (b) A row among the props is a key of the documented props types.
    if (!typeKeys.has(row.name)) {
      at(`"${row.name}" is shown as a prop but is not a key of the props type of ${documented.map((c) => c.displayName).join(' / ') || '(no component)'}: file it under "${STORY_CONTROLS}" (storyControl()) or hide it (table: { disable: true })`);
      continue;
    }
    if (row.category !== null) at(`prop "${row.name}" is in category "${row.category}": props stay uncategorized`);
    const tsdoc = docgenProps.get(row.name);
    if (tsdoc === undefined) {
      // A key of the type the docgen filters out (an inherited HTML attribute the story exposes): the
      // story describes it. A docgen prop without TSDoc is reported once, by (c) below.
      if (!row.description.trim()) at(`prop "${row.name}" (inherited, not in the docgen) has no description in the story's argTypes`);
    } else if (tsdoc.trim() && row.description !== tsdoc) {
      // The TSDoc is the single source: an argTypes description that replaces it drifts.
      at(`prop "${row.name}": the story's argTypes description replaces the TSDoc of the source (drop it, or fix the TSDoc)`);
    }
  }

  // (c) Every prop the docgen documents has its TSDoc.
  for (const component of documented) {
    for (const [key, prop] of Object.entries(component.props)) {
      if (!prop.description.trim()) at(`${component.displayName}.${key} has no TSDoc`);
    }
  }

  // (d) The props react-docgen used to lose are there.
  for (const component of documented) {
    for (const key of options.requiredProps[component.displayName] ?? []) {
      if (!Object.hasOwn(component.props, key)) at(`${component.displayName}: prop "${key}" missing from the docgen`);
    }
  }
  return problems;
}
