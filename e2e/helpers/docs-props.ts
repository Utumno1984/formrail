import { resolve } from 'node:path';
import ts from 'typescript';
import { docgenCompilerOptions, isProjectFile, isReactTypesFile } from '../../.storybook/docgen';

// The props-table guard of the Docs pages (ticket #401): pure audit + the Node side that reads the real
// props types. Used by e2e/docs-props.spec.ts, which feeds it what the built Storybook's preview holds.

/** Category of the story args that are not props (packages/core/src/internal/story-docs.ts). */
export const STORY_CONTROLS = 'Story controls';

/** One component as the docgen saw it (`__docgenInfo`). */
export interface DocgenComponent {
  displayName: string;
  /** Repo-relative (the docgen plugin of main.ts strips the build machine's checkout from the bundle). */
  filePath: string;
  props: Record<string, { description: string }>;
  /** Every `parent.fileName` / `declarations[].fileName` of the props: repo-relative too. */
  propFiles: string[];
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

/** One key of a component's props type, as the TypeScript checker sees it. */
export interface PropsTypeKey {
  /** Some declaration is outside `@types/react`: the docgen keeps it, so it must be in the docgen. */
  documentable: boolean;
  /** Some declaration is in the project's own sources (`packages/*\/src`, not a dependency). */
  declaredByProject: boolean;
  /** One of the project's declarations carries its own TSDoc. */
  projectTsdoc: boolean;
  /** A declaration in `@types/react` carries TSDoc: the checker joins it to the project's text. */
  reactTypesTsdoc: boolean;
}

/** The props type of a component: every key, HTML attributes included. */
export type PropsTypeKeys = Map<string, PropsTypeKey>;

const hasOwnTsdoc = (declaration: ts.Declaration) =>
  ts.getJSDocCommentsAndTags(declaration).some((doc) => ts.isJSDoc(doc) && !!ts.getTextOfJSDocComment(doc.comment)?.trim());

/**
 * Every key of a component's props type, read from the TypeScript checker (not from the docgen, which it
 * checks): `Button`'s `disabled` is a real prop even though the docgen leaves it out. Unions contribute
 * the keys of every member (`TableName`).
 */
export function createPropsTypeReader(repoRoot: string, components: DocgenComponent[]): (component: DocgenComponent) => PropsTypeKeys | string {
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
    const keys: PropsTypeKeys = new Map();
    for (const signature of type.getCallSignatures()) {
      const [props] = signature.getParameters();
      if (!props) continue;
      const propsType = checker.getTypeOfSymbolAtLocation(props, source);
      for (const member of propsType.isUnion() ? propsType.types : [propsType]) {
        for (const key of checker.getPropertiesOfType(checker.getApparentType(member))) {
          const declarations = key.getDeclarations() ?? [];
          const fileOf = (d: ts.Declaration) => d.getSourceFile().fileName;
          const own = declarations.filter((d) => isProjectFile(fileOf(d)));
          const seen = keys.get(key.name);
          keys.set(key.name, {
            documentable: (seen?.documentable ?? false) || declarations.some((d) => !isReactTypesFile(fileOf(d))),
            declaredByProject: (seen?.declaredByProject ?? false) || own.length > 0,
            projectTsdoc: (seen?.projectTsdoc ?? false) || own.some(hasOwnTsdoc),
            reactTypesTsdoc: (seen?.reactTypesTsdoc ?? false) || declarations.some((d) => isReactTypesFile(fileOf(d)) && hasOwnTsdoc(d)),
          });
        }
      }
    }
    if (keys.size === 0) return `${component.filePath}: ${component.displayName} has no call signature with a props parameter`;
    return keys;
  };
}

/** A path of the bundle that names no build machine: `packages/...` or `node_modules/...`. */
const isRepoRelative = (path: string) => /^(?:packages|node_modules)[\\/]/.test(path);

export interface AuditOptions {
  /** Props type keys of a component (see createPropsTypeReader), or why they could not be read. */
  propsTypeKeys: (component: DocgenComponent) => PropsTypeKeys | string;
  /** Pages that document no component (a showcase, a hook, the foundations), with the reason. */
  pagesWithoutComponent: Readonly<Record<string, string>>;
  /**
   * Inherited HTML attributes (left out of the docgen) that a page's props table shows as rows of its
   * component, per component, with the reason: any other row outside "Story controls" must be a prop
   * of the docgen.
   */
  inheritedAttributeRows: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Props each listed component must show (the ones react-docgen used to lose). */
  requiredProps: Readonly<Record<string, readonly string[]>>;
  /**
   * Props a component passes through from a dependency (Radix) that the table shows with the
   * dependency's own TSDoc, per component, with why that text is true of the component. Any other
   * pass-through prop must be redeclared with the project's TSDoc: a wrapper that intercepts a
   * dependency's prop (calls `preventDefault()` itself, does the work another way) changes what the
   * dependency's text promises.
   */
  dependencyTsdocProps: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * Story controls whose name is also an inherited HTML attribute of the page's component, per
   * component, with what the control really drives (e.g. `required` of the surrounding `Field`): any
   * other such name filed under "Story controls" fails, as it may be the attribute itself hidden there.
   */
  storyControlAttributeNames: Readonly<Record<string, Readonly<Record<string, string>>>>;
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
    for (const path of new Set([component.filePath, ...component.propFiles])) {
      if (!isRepoRelative(path)) at(`${component.displayName}: path "${path}" in the bundle is not repo-relative`);
    }
  }

  // (a) The page's component has a props table.
  if (withoutComponent !== undefined) {
    if (page.component) at(`listed as a page without component, but documents ${page.component.displayName}: drop it from the list`);
  } else if (!page.component) {
    at('no `component` with docgen: set the real component on the meta (or list the page as without component, with the reason)');
  } else if (Object.keys(page.component.props).length === 0) {
    at(`the props table of ${page.component.displayName} is empty`);
  }

  const typeKeys = new Map<DocgenComponent, PropsTypeKeys>();
  for (const component of documented) {
    const keys = options.propsTypeKeys(component);
    if (typeof keys === 'string') at(keys);
    else typeKeys.set(component, keys);
  }

  // (b) The rows. Storybook merges the docgen into the rows of the page's `component` only (a
  // subcomponent has its own tab, with no rows here): outside "Story controls" a row is a prop of that
  // docgen, with its TSDoc, or one of the listed inherited attributes, with the story's description.
  const main = page.component;
  const docgenProps = new Map<string, string>(Object.entries(main?.props ?? {}).map(([key, prop]) => [key, prop.description]));
  const inherited = (main && options.inheritedAttributeRows[main.displayName]) ?? {};
  const rows = new Map(page.rows.map((row) => [row.name, row]));
  for (const key of docgenProps.keys()) {
    const row = rows.get(key);
    if (!row) at(`prop "${key}" of ${main?.displayName} has no row in the props table`);
    else if (row.disabled) at(`prop "${key}" of ${main?.displayName} is hidden from the props table (\`table: { disable: true }\`)`);
  }
  for (const row of page.rows) {
    if (row.disabled) continue;
    if (row.category === STORY_CONTROLS) {
      // (b') A real prop of the component filed as a demo knob would hide it from the props.
      if (main && (docgenProps.has(row.name) || Object.hasOwn(inherited, row.name))) {
        at(`"${row.name}" is a prop of ${main.displayName} but is filed under "${STORY_CONTROLS}"`);
      } else if (main && typeKeys.get(main)?.has(row.name) && !Object.hasOwn(options.storyControlAttributeNames[main.displayName] ?? {}, row.name)) {
        // An inherited HTML attribute the component accepts (left out of the docgen): a demo knob with
        // its name may be that attribute filed away from the props. Only a reviewed name passes.
        at(`"${row.name}" is an attribute of ${main.displayName}'s props type but is filed under "${STORY_CONTROLS}": rename the demo control, list it as an inherited attribute, or list it as a story control that only shares the name, with the reason`);
      }
      if (!row.description.trim()) at(`story control "${row.name}" has no description (what it does, or which hook option it is)`);
      continue;
    }
    const tsdoc = docgenProps.get(row.name);
    if (tsdoc !== undefined) {
      if (row.category !== null) at(`prop "${row.name}" is in category "${row.category}": props stay uncategorized`);
      // The TSDoc is the single source: an argTypes description that replaces it drifts.
      if (tsdoc.trim() && row.description !== tsdoc) at(`prop "${row.name}": an argTypes description overrides its TSDoc`);
      continue;
    }
    if (main && Object.hasOwn(inherited, row.name)) {
      if (!typeKeys.get(main)?.has(row.name)) at(`"${row.name}" is listed as an inherited attribute of ${main.displayName}, but its props type has no such key`);
      if (row.category !== null) at(`prop "${row.name}" is in category "${row.category}": props stay uncategorized`);
      if (!row.description.trim()) at(`inherited attribute "${row.name}" has no description in the story's argTypes`);
      continue;
    }
    at(`"${row.name}" is not a prop in the docgen of ${main?.displayName ?? '(no component)'}: file it under "${STORY_CONTROLS}" (a subcomponent's prop: "Prop of \`X\` (see its tab)"), or list it as an inherited attribute with the reason`);
  }

  for (const component of documented) {
    const keys = typeKeys.get(component);
    // (c) Every prop the docgen documents has a TSDoc, the project's own if the project declares it.
    for (const [key, prop] of Object.entries(component.props)) {
      const info = keys?.get(key);
      if (info?.declaredByProject) {
        if (!info.projectTsdoc) {
          at(`${component.displayName}.${key} has no TSDoc of its own${prop.description.trim() ? ' (the table shows the text inherited from its base type)' : ''}`);
        } else if (info.reactTypesTsdoc) {
          at(`${component.displayName}.${key}: its TSDoc is joined to the generic @types/react text (leave the attribute out of the base type)`);
        }
      } else if (!prop.description.trim()) {
        at(`${component.displayName}.${key} has no TSDoc`);
      } else if (info && !Object.hasOwn(options.dependencyTsdocProps[component.displayName] ?? {}, key)) {
        // (c') A dependency's prop shown with the dependency's text: only where that text is known to
        // hold for the wrapper.
        at(`${component.displayName}.${key} shows the TSDoc of its dependency: redeclare it with the project's own TSDoc (same type), or list it as faithful to the dependency, with the reason`);
      }
    }
    // (c'') No stale entry in the list of the dependency texts kept as they are.
    for (const key of Object.keys(options.dependencyTsdocProps[component.displayName] ?? {})) {
      if (!Object.hasOwn(component.props, key)) at(`${component.displayName}.${key} is listed as keeping its dependency's TSDoc, but it is not in the docgen`);
      else if (keys?.get(key)?.declaredByProject) at(`${component.displayName}.${key} is listed as keeping its dependency's TSDoc, but the project redeclares it: drop it from the list`);
    }
    // (e) The docgen lists every key it should keep: everything not declared by @types/react (the
    // project's props and the dependencies' public ones, e.g. Radix's `asChild`), for every component.
    for (const [key, info] of keys ?? []) {
      if (info.documentable && !Object.hasOwn(component.props, key)) at(`${component.displayName}: prop "${key}" of its props type is missing from the docgen`);
    }
    // (d) The props react-docgen used to lose are there.
    for (const key of options.requiredProps[component.displayName] ?? []) {
      if (!Object.hasOwn(component.props, key)) at(`${component.displayName}: prop "${key}" missing from the docgen`);
    }
  }
  return problems;
}
