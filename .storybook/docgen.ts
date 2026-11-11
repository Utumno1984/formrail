// Docgen settings of the props tables (ticket #401). Shared by .storybook/main.ts (the build) and
// e2e/docs-props.spec.ts (the guard), so the guard resolves the component types with exactly the
// compiler options the docgen used: the two cannot drift apart.
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const fromRoot = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

/** The component sources the docgen reads (stories and tests excluded). Absolute: the plugin's root is not `.storybook/`. */
export const docgenInclude = [fromRoot('packages/core/src/**/*.tsx'), fromRoot('packages/pro/src/**/*.tsx')];
export const docgenExclude = ['**/*.stories.tsx', '**/*.test.tsx'];

/**
 * Inline compiler options (there is no root tsconfig.json; each package has its own). `paths` points the
 * Pro sources' `@formrail/core` imports at the core SOURCES, like the Vite aliases in main.ts: through the
 * package entry they would resolve to `dist/` (not built in the e2e/visual jobs), and the props a Pro
 * component inherits from a core type (`VirtualListReportTable` = `ListReportTableProps & {...}`) would
 * be lost.
 */
export const docgenCompilerOptions: ts.CompilerOptions = {
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  paths: {
    '@formrail/core': [fromRoot('packages/core/src/index.ts')],
    '@formrail/core/internal': [fromRoot('packages/core/src/internal.ts')],
  },
};

/** The part of a react-docgen-typescript prop the filter reads. */
export interface DocgenPropSource {
  name: string;
  parent?: { fileName: string } | undefined;
  declarations?: { fileName: string }[] | undefined;
}

/**
 * Keeps the props declared by our own types; drops the HTML/ARIA attributes every component inherits from
 * `node_modules/@types/react` (`HTMLAttributes<...>`, hundreds of rows with no project TSDoc) and the
 * props inherited from a dependency's types. A prop that one of our types REDECLARES (`aria-label`,
 * `aria-labelledby`, `caption` in `ListReportTable`'s `TableName`; `aria-label` on the icon `Button`)
 * has a declaration outside node_modules and is kept: `parent` alone names only the first declaration,
 * hence the scan of `declarations`.
 */
export function docgenPropFilter(prop: DocgenPropSource): boolean {
  const files = prop.declarations?.length ? prop.declarations.map((d) => d.fileName) : prop.parent ? [prop.parent.fileName] : [];
  if (files.length === 0) return true;
  return files.some((file) => !file.includes('/node_modules/'));
}
