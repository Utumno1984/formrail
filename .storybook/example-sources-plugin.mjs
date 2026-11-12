// Vite plugin that serves the copy-paste example files of the build (ticket #447) to `exampleStory`
// (packages/core/src/internal/example-story.ts), as the virtual module `virtual:formrail/example-sources`.
//
// Why a virtual module and not a glob written in example-story.ts: a glob literal is the same in every build,
// and an `eager` glob imports what it matches even when no story uses it. The examples of packages/pro must
// stay out of the Free build (STORYBOOK_EXCLUDE_PRO=1), and the not-yet-public Pro folders out of the Pro demo
// (STORYBOOK_EDITION=pro): the globs are chosen per build by `exampleSources` (story-globs.mjs), from the same
// variables and the same exclusion list as the story globs. One lookup for core and Pro, so a file name is
// unique across both packages.
import { exampleSources } from './story-globs.mjs';

export const EXAMPLE_SOURCES_MODULE = 'virtual:formrail/example-sources';
const RESOLVED = `\0${EXAMPLE_SOURCES_MODULE}`;

/**
 * The module's code: one entry per package folder, with the modules and the text of its example files
 * (two globs on the same patterns, so both are keyed by the same paths).
 * @param {{ root: string, globs: string[] }[]} sources
 */
export function exampleSourcesModule(sources) {
  const entries = sources.map(({ root, globs }) => {
    const patterns = JSON.stringify(globs);
    return [
      '  {',
      `    root: ${JSON.stringify(root)},`,
      `    modules: import.meta.glob(${patterns}, { eager: true }),`,
      `    texts: import.meta.glob(${patterns}, { eager: true, query: '?raw', import: 'default' }),`,
      '  },',
    ].join('\n');
  });
  return `export default [\n${entries.join('\n')}\n];\n`;
}

/** @param {{ env?: NodeJS.ProcessEnv }} [options] */
export function exampleSourcesPlugin({ env = process.env } = {}) {
  const code = exampleSourcesModule(exampleSources(env));
  return {
    name: 'formrail:example-sources',
    resolveId(id) {
      return id === EXAMPLE_SOURCES_MODULE ? RESOLVED : null;
    },
    load(id) {
      return id === RESOLVED ? code : null;
    },
  };
}
