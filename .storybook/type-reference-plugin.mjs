// Vite plugin that serves the reference of the public hooks and types (ticket #402) to the MDX blocks of
// ./type-reference-blocks.tsx, as the virtual module `virtual:formrail/type-reference`.
//
// Generated at build time, never written to the repo (see scripts/type-reference.mjs for the extraction and
// the guard). Lazy: the TypeScript program is built the first time a page imports the module, so a build in
// which no page uses a reference block pays nothing. In the dev server a change to a package source
// invalidates the module: reloading the page shows the new TSDoc, with no restart and no manual step.
import { resolve, sep } from 'node:path';
// Plain .mjs on both sides: Storybook loads main.ts with Node, so no TS-only import syntax is needed here.
import { REPO_ROOT, extractReference, createReferenceProgram, publicEntries, referenceCompilerOptions } from '../scripts/type-reference.mjs';
import { excludePro } from './story-globs.mjs';

export const TYPE_REFERENCE_MODULE = 'virtual:formrail/type-reference';
const RESOLVED = `\0${TYPE_REFERENCE_MODULE}`;

const PACKAGE_SOURCES = [resolve(REPO_ROOT, 'packages/core/src') + sep, resolve(REPO_ROOT, 'packages/pro/src') + sep];
/** A package source the reference can read (stories and tests never reach a public entry). */
const isReferenceSource = (file) =>
  PACKAGE_SOURCES.some((dir) => file.startsWith(dir)) && /\.tsx?$/.test(file) && !/\.(stories|test)\.tsx?$/.test(file);

/**
 * @param {{ env?: NodeJS.ProcessEnv, root?: string }} [options] `env`: the Free build (`STORYBOOK_EXCLUDE_PRO`)
 *   leaves the Pro entry out, like its stories.
 */
export function typeReferencePlugin({ env = process.env, root = REPO_ROOT } = {}) {
  const entries = publicEntries(root, { pro: !excludePro(env) });
  /** @type {import('typescript').Program | undefined} */
  let program;
  /** @type {string | undefined} */
  let code;
  return {
    name: 'formrail:type-reference',
    resolveId(id) {
      return id === TYPE_REFERENCE_MODULE ? RESOLVED : null;
    },
    load(id) {
      if (id !== RESOLVED) return null;
      if (code === undefined) {
        const started = performance.now();
        program = createReferenceProgram(entries, { compilerOptions: referenceCompilerOptions(root), oldProgram: program });
        const reference = extractReference(program, entries, { root });
        code = `export default ${JSON.stringify(reference)};\n`;
        this.info?.(`type reference: ${Object.keys(reference.entries).length} entries in ${Math.round(performance.now() - started)} ms`);
      }
      return code;
    },
    // Dev server: a package source changed -> drop the cached JSON and reload the pages that import it. The
    // previous program is kept, so the next generation re-parses only the files that changed.
    handleHotUpdate({ file, server, modules }) {
      if (!isReferenceSource(file)) return undefined;
      code = undefined;
      const mod = server.moduleGraph.getModuleById(RESOLVED);
      if (!mod) return undefined;
      server.moduleGraph.invalidateModule(mod);
      return [...modules, mod];
    },
  };
}

/**
 * Adds the plugin to a Storybook config, after its own `viteFinal`. A wrapper rather than one more entry in
 * the `plugins` array of main.ts so that the plugins of the other docs tickets and this one stay on separate
 * lines.
 * @template {{ viteFinal?: (config: any, options: any) => any }} T
 * @param {T} config
 * @returns {T}
 */
export function withTypeReference(config) {
  return {
    ...config,
    viteFinal: async (viteConfig, options) => {
      const resolved = config.viteFinal ? await config.viteFinal(viteConfig, options) : viteConfig;
      return { ...resolved, plugins: [...(resolved.plugins ?? []), typeReferencePlugin()] };
    },
  };
}
