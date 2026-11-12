// Story-only (tickets #403, #447): the lookup behind `exampleStory` (example-story.ts), kept pure so it is
// unit-tested without Vite. The example files come from the build (one entry per package folder, see
// .storybook/example-sources-plugin.mjs); this module only finds one by name.
import type { ComponentType } from 'react';

/** The example files of one package source folder, as the build found them. */
export interface ExampleSource {
  /** The repository folder searched (`packages/core/src`): named in the "no such example file" error. */
  root: string;
  /** The modules of its `*.example.tsx` files, keyed by path. */
  modules: Record<string, Record<string, unknown>>;
  /** Their text, keyed by the same paths. */
  texts: Record<string, string>;
}

/** An example file found by name: its only exported component and its text. */
export interface ExampleFile {
  path: string;
  component: ComponentType<object>;
  code: string;
}

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/**
 * The lookup of the example files of `sources` by file NAME (`'DirtyGuard.example.tsx'`). Throws at once on
 * two files with the same name, in the same folder or in two packages (the lookup would be ambiguous). The
 * returned function throws on a name with no file, naming the folders searched, and on a file that does not
 * export exactly one component.
 */
export function createExampleLookup(sources: readonly ExampleSource[]): (file: string) => ExampleFile {
  const byName = new Map<string, { path: string; module: Record<string, unknown>; code: string | undefined }>();
  for (const { modules, texts } of sources) {
    for (const [path, module] of Object.entries(modules)) {
      const name = fileName(path);
      const seen = byName.get(name);
      if (seen) throw new Error(`Two example files named ${name} (${seen.path}, ${path}): the lookup would be ambiguous`);
      byName.set(name, { path, module, code: texts[path] });
    }
  }
  const searched = sources.map((source) => source.root).join(' or ') || '(no folder in this build)';
  return (file) => {
    const found = byName.get(file);
    if (!found || found.code === undefined) throw new Error(`${file}: no such example file (expected a *.example.tsx under ${searched})`);
    const components = Object.values(found.module).filter((value): value is ComponentType<object> => typeof value === 'function');
    if (components.length !== 1) throw new Error(`${file}: an example file exports exactly one component, found ${components.length}`);
    return { path: found.path, component: components[0]!, code: found.code };
  };
}
