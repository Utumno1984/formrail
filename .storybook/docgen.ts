// Docgen settings of the props tables (ticket #401). Shared by .storybook/main.ts (the build) and
// e2e/docs-props.spec.ts (the guard), so the guard resolves the component types with exactly the
// compiler options the docgen used: the two cannot drift apart.
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import type { Plugin } from 'vite';

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

const REPO_ROOT = fromRoot('');

const CHECKOUT_DIR = basename(REPO_ROOT);
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * react-docgen-typescript writes two kinds of paths into the bundle, both naming the build machine's
 * checkout in the public Storybook:
 * - `__docgenInfo.filePath`: ABSOLUTE (`/home/<user>/<checkout>/packages/core/src/...`);
 * - each prop's `parent.fileName` / `declarations[].fileName`: trimmed by its `trimFileName` to the
 *   checkout's own directory name plus the rest (`<checkout>/packages/core/src/...`,
 *   `<checkout>/node_modules/@types/react/index.d.ts`): not absolute, but the directory name leaks.
 * This Vite plugin, run after the docgen's transform, makes all of them repo-relative
 * (`packages/core/src/...`, `node_modules/...`). The guard (e2e/docs-props.spec.ts) fails on any path
 * of the three that is not repo-relative, and resolves `filePath` from the repo root.
 */
export function docgenRelativePaths(): Plugin {
  // As it appears inside the JSON the docgen emits (a JSON string escapes nothing in a POSIX path, but
  // a Windows one would have its backslashes doubled).
  const absolute = JSON.stringify(REPO_ROOT).slice(1, -1);
  // `"fileName": "<checkout>/...` (either separator, a backslash doubled by JSON).
  const trimmed = new RegExp(`(\\bfileName["'\`]?\\s*:\\s*["'\`])${escapeRegExp(CHECKOUT_DIR)}(?:/|\\\\\\\\)`, 'g');
  return {
    name: 'formrail:docgen-relative-paths',
    enforce: 'post',
    transform(code, id) {
      if (!id.endsWith('.tsx') || !code.includes('__docgenInfo')) return null;
      const relative = code.replaceAll(absolute, '').replace(trimmed, '$1');
      return relative === code ? null : { code: relative, map: null };
    },
  };
}

/** The part of a react-docgen-typescript prop the filter reads. */
export interface DocgenPropSource {
  name: string;
  parent?: { fileName: string } | undefined;
  declarations?: { fileName: string }[] | undefined;
}

/**
 * A file of `@types/react`: where the HTML/DOM attributes come from (`HTMLAttributes<...>`,
 * `AriaAttributes`, `DOMAttributes`, `ref`, `key`). Matches the absolute paths of the checker and the
 * `<checkout>/node_modules/...` / `node_modules/...` ones of the docgen, with either separator.
 */
export const isReactTypesFile = (file: string) => /(?:^|[\\/])node_modules[\\/]@types[\\/]react[\\/]/.test(file);

/** A file outside every dependency: one of the project's own sources. */
export const isProjectFile = (file: string) => !/(?:^|[\\/])node_modules[\\/]/.test(file);

/**
 * Drops only the HTML/ARIA/DOM attributes every component inherits from `@types/react` (hundreds of rows
 * with no project TSDoc). Everything else stays:
 * - the props declared by our own types;
 * - the props of a dependency's PUBLIC API that a component passes through (Radix: `asChild`,
 *   `onEscapeKeyDown`, `sideOffset`, a `MenuItem`'s `textValue`, ...). Radix re-exposes no DOM noise of
 *   its own: its primitives' DOM attributes are `ComponentPropsWithoutRef<'div'>` & co., i.e. declared in
 *   `@types/react`, so they are dropped by the same rule. Where Radix's declaration carries no TSDoc, our
 *   type redeclares the prop (same type) with one: the guard fails on an undocumented prop.
 * A prop that one of our types REDECLARES over an HTML attribute (`aria-label` / `aria-labelledby` /
 * `caption` in `ListReportTable`'s `TableName`, `aria-label` on the icon `Button`) has a declaration
 * outside `@types/react` and is kept: `parent` alone names only the first declaration, hence the scan of
 * `declarations`.
 */
export function docgenPropFilter(prop: DocgenPropSource): boolean {
  const files = prop.declarations?.length ? prop.declarations.map((d) => d.fileName) : prop.parent ? [prop.parent.fileName] : [];
  if (files.length === 0) return true;
  return files.some((file) => !isReactTypesFile(file));
}
