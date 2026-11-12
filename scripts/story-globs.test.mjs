import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import micromatch from 'micromatch';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLE_SOURCES_MODULE, exampleSourcesModule, exampleSourcesPlugin } from '../.storybook/example-sources-plugin.mjs';
import { PRO_DEMO_NOT_PUBLIC, exampleSources, excludePro, introductionPages, previewAnnotations, proEdition, referenceFixtures, referencePages, storyGlobs } from '../.storybook/story-globs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('storyGlobs (#175)', () => {
  it('includes packages/pro when the variable is not set', () => {
    const globs = storyGlobs({});
    expect(globs.some((g) => g.includes('packages/pro'))).toBe(true);
    expect(globs.some((g) => g.includes('packages/core'))).toBe(true);
  });

  it('leaves packages/pro out when STORYBOOK_EXCLUDE_PRO=1, keeping the Free stories', () => {
    const globs = storyGlobs({ STORYBOOK_EXCLUDE_PRO: '1' });
    expect(globs.some((g) => g.includes('packages/pro'))).toBe(false);
    expect(globs.some((g) => g.includes('packages/core'))).toBe(true);
  });

  it('loads the pro CSS entry only together with the pro stories', () => {
    expect(previewAnnotations({})).toEqual(['./preview-pro.ts']);
    expect(previewAnnotations({ STORYBOOK_EXCLUDE_PRO: '1' })).toEqual([]);
    const preview = readFileSync(resolve(ROOT, '.storybook/preview-pro.ts'), 'utf8');
    expect(preview).toContain("'../packages/pro/src/styles/index.css'");
  });

  it.each(['', '0', 'false'])('treats %j as "not excluded"', (value) => {
    expect(excludePro({ STORYBOOK_EXCLUDE_PRO: value })).toBe(false);
  });

  it('reads process.env by default', () => {
    const previous = process.env.STORYBOOK_EXCLUDE_PRO;
    try {
      process.env.STORYBOOK_EXCLUDE_PRO = '1';
      expect(storyGlobs().some((g) => g.includes('packages/pro'))).toBe(false);
      delete process.env.STORYBOOK_EXCLUDE_PRO;
      expect(storyGlobs().some((g) => g.includes('packages/pro'))).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.STORYBOOK_EXCLUDE_PRO;
      else process.env.STORYBOOK_EXCLUDE_PRO = previous;
    }
  });

  it('Free mode and complete mode are unchanged by the Pro edition support', () => {
    expect(storyGlobs({})).toEqual(['../packages/core/src/**/*.stories.tsx', '../packages/pro/src/**/*.stories.tsx']);
    expect(storyGlobs({ STORYBOOK_EXCLUDE_PRO: '1' })).toEqual(['../packages/core/src/**/*.stories.tsx']);
    expect(previewAnnotations({})).toEqual(['./preview-pro.ts']);
    expect(previewAnnotations({ STORYBOOK_EXCLUDE_PRO: '1' })).toEqual([]);
    expect(introductionPages({})).toEqual(['./Introduction.mdx']);
    expect(introductionPages({ STORYBOOK_EXCLUDE_PRO: '1' })).toEqual(['./Introduction.mdx']);
  });

  describe('Pro edition (STORYBOOK_EDITION=pro, #381)', () => {
    const env = { STORYBOOK_EDITION: 'pro' };

    it('has only Pro story globs and the Pro introduction page', () => {
      // Every Pro folder is public since #384: the plain glob (an empty extglob `!()` would match nothing).
      expect(storyGlobs(env)).toEqual(['../packages/pro/src/**/*.stories.tsx', './ProIntroduction.mdx']);
      expect(introductionPages(env)).toEqual([]);
    });

    it('excludes nothing in any build since #384 (Form rebase public); an exclusion would only apply to the Pro demo (#421)', () => {
      expect(PRO_DEMO_NOT_PUBLIC).toEqual([]);
      for (const mode of [{}, { STORYBOOK_EXCLUDE_PRO: '1' }, env]) {
        expect(storyGlobs(mode).some((g) => g.includes('form-rebase') || g.includes('!('))).toBe(false);
      }
      // The Form rebase stories are in the Pro demo glob.
      const [proGlob] = storyGlobs(env);
      expect(micromatch.isMatch('packages/pro/src/form-rebase/FormRebase.stories.tsx', proGlob.replace('../', ''))).toBe(true);
      expect(micromatch.isMatch('packages/pro/src/form-rebase/RebaseNotice.stories.tsx', proGlob.replace('../', ''))).toBe(true);
      // An exclusion still only applies to the Pro demo, and must point at a real folder.
      for (const dir of PRO_DEMO_NOT_PUBLIC) expect(existsSync(resolve(ROOT, 'packages/pro/src', dir))).toBe(true);
      expect(storyGlobs({}, ['form-rebase']).some((g) => g.includes('!('))).toBe(false);
    });

    it('an empty PRO_DEMO_NOT_PUBLIC still matches the real Pro stories (empty extglob `!()` matches nothing)', () => {
      const story = 'packages/pro/src/change-summary/ChangeSummary.stories.tsx';
      expect(existsSync(resolve(ROOT, story))).toBe(true);
      // Before the fix: the old formula applied to an empty list matched no story at all (same matcher as Storybook).
      const degenerate = `packages/pro/src/!(${[].join('|')})/**/*.stories.tsx`;
      expect(micromatch.isMatch(story, degenerate)).toBe(false);
      // After the fix: the plain glob, no extglob wrapper, matches it.
      const [proGlob] = storyGlobs(env, []);
      expect(proGlob).toBe('../packages/pro/src/**/*.stories.tsx');
      expect(micromatch.isMatch(story, proGlob.replace('../', ''))).toBe(true);
      // A non-empty list still excludes exactly its folders.
      const [filtered] = storyGlobs(env, ['form-rebase']);
      expect(micromatch.isMatch(story, filtered.replace('../', ''))).toBe(true);
      expect(micromatch.isMatch('packages/pro/src/form-rebase/FormRebase.stories.tsx', filtered.replace('../', ''))).toBe(false);
    });

    it('loads the Pro CSS entry and the banner annotation, in this order', () => {
      expect(previewAnnotations(env)).toEqual(['./preview-pro.ts', './preview-pro-demo.ts']);
    });

    it('only the value "pro" selects it', () => {
      for (const value of ['', 'free', 'PRO', '1']) expect(proEdition({ STORYBOOK_EDITION: value })).toBe(false);
      expect(proEdition({})).toBe(false);
      expect(proEdition(env)).toBe(true);
    });

    it('contradicting STORYBOOK_EXCLUDE_PRO fails loudly', () => {
      expect(() => storyGlobs({ ...env, STORYBOOK_EXCLUDE_PRO: '1' })).toThrow(/mutually exclusive/);
    });

    it('every referenced file exists next to the config', () => {
      for (const file of [...previewAnnotations(env), './ProIntroduction.mdx']) {
        expect(() => readFileSync(resolve(ROOT, '.storybook', file))).not.toThrow();
      }
    });

    it('the banner annotation is not part of any other mode', () => {
      expect(previewAnnotations({})).not.toContain('./preview-pro-demo.ts');
      expect(previewAnnotations({ STORYBOOK_EXCLUDE_PRO: '1' })).not.toContain('./preview-pro-demo.ts');
    });

    it('the Pro build is made by the package.json script, run by deploy-pages only', () => {
      const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
      expect(pkg.scripts['build-storybook:pro']).toMatch(/^STORYBOOK_EDITION=pro .*storybook build -o storybook-static-pro$/);
      const ci = readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8');
      const deployJob = ci.slice(ci.indexOf('deploy-pages:'));
      expect(deployJob).toContain('npm run build-storybook:pro');
      expect(ci.slice(0, ci.indexOf('deploy-pages:'))).not.toContain('build-storybook:pro');
      expect(ci).not.toMatch(/STORYBOOK_EDITION:/);
    });
  });

  it('only the deploy-pages step of the workflow sets the variable', () => {
    const ci = readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8');
    const occurrences = ci.match(/STORYBOOK_EXCLUDE_PRO/g) ?? [];
    expect(occurrences.length).toBeGreaterThan(0);
    const deployJob = ci.slice(ci.indexOf('deploy-pages:'));
    expect(deployJob).toMatch(/STORYBOOK_EXCLUDE_PRO: '?1'?/);
    expect(ci.slice(0, ci.indexOf('deploy-pages:'))).not.toMatch(/STORYBOOK_EXCLUDE_PRO: /);
  });

  it('STORYBOOK_HIDE_INTERNAL (public sidebar without test fixtures, #296) is set only by the deploy job', () => {
    const ci = readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8');
    const deployJob = ci.slice(ci.indexOf('deploy-pages:'));
    expect(deployJob).toMatch(/STORYBOOK_HIDE_INTERNAL: '?1'?/);
    // The e2e/visual builds must keep the fixtures in the sidebar-independent index and local dev shows them.
    expect(ci.slice(0, ci.indexOf('deploy-pages:'))).not.toMatch(/STORYBOOK_HIDE_INTERNAL: /);
  });
});

describe('exampleSources (#447)', () => {
  const FREE = { STORYBOOK_EXCLUDE_PRO: '1' };
  const PRO_DEMO = { STORYBOOK_EDITION: 'pro' };
  const examples = ['core', 'pro'].flatMap((pkg) =>
    readdirSync(resolve(ROOT, 'packages', pkg, 'src'), { recursive: true, encoding: 'utf8' })
      .filter((path) => path.endsWith('.example.tsx'))
      .map((path) => `packages/${pkg}/src/${path.split(sep).join('/')}`),
  );
  /** The example files a build's example globs select (Vite globs from the root: a leading `/`, `!` negates). */
  const selected = (env) => {
    const globs = exampleSources(env).flatMap((source) => source.globs);
    return micromatch(examples, globs.map((glob) => glob.replace(/^(!?)\//, '$1')));
  };
  /** Whether the stories file next to an example is in the build (Storybook globs, relative to .storybook/). */
  const storiesInBuild = (env, example) => micromatch.isMatch(example.replace(/\.example\.tsx$/, '.stories.tsx'), storyGlobs(env).map((glob) => glob.replace(/^\.\.\//, '')));

  it('finds the example files of both packages on disk (the checks below are not vacuous)', () => {
    expect(examples.filter((path) => path.startsWith('packages/core/')).length).toBeGreaterThan(10);
    expect(examples).toEqual(expect.arrayContaining(['packages/pro/src/change-summary/ChangeSummary.example.tsx', 'packages/pro/src/form-rebase/FormRebase.example.tsx']));
  });

  it('one entry per package folder of the build: core + Pro, core only in the Free build, Pro only in the Pro demo', () => {
    expect(exampleSources({}).map((source) => source.root)).toEqual(['packages/core/src', 'packages/pro/src']);
    expect(exampleSources(FREE)).toEqual([{ root: 'packages/core/src', globs: ['/packages/core/src/**/*.example.tsx'] }]);
    expect(exampleSources(PRO_DEMO)).toEqual([
      { root: 'packages/pro/src', globs: ['/packages/pro/src/**/*.example.tsx', ...PRO_DEMO_NOT_PUBLIC.map((dir) => `!/packages/pro/src/${dir}/**`)] },
    ]);
    expect(exampleSources(PRO_DEMO, [])).toEqual([{ root: 'packages/pro/src', globs: ['/packages/pro/src/**/*.example.tsx'] }]);
  });

  it.each([
    ['complete', {}],
    ['Free', FREE],
    ['Pro demo', PRO_DEMO],
  ])('%s build: an example is selected exactly when the stories next to it are in the build', (_, env) => {
    const chosen = selected(env);
    for (const example of examples) expect(chosen.includes(example), example).toBe(storiesInBuild(env, example));
  });

  it('the Free build selects no Pro example, the Pro demo every Pro example (Form rebase public since #384)', () => {
    expect(selected(FREE).filter((path) => path.startsWith('packages/pro/'))).toEqual([]);
    expect(selected(PRO_DEMO)).toContain('packages/pro/src/change-summary/ChangeSummary.example.tsx');
    expect(selected(PRO_DEMO)).toContain('packages/pro/src/form-rebase/FormRebase.example.tsx');
    expect(selected(PRO_DEMO)).toContain('packages/pro/src/form-rebase/RebaseNotice.example.tsx');
    expect(selected({})).toContain('packages/pro/src/form-rebase/FormRebase.example.tsx');
    // A folder kept out of the Pro demo is still left out of its examples.
    const kept = micromatch(examples, exampleSources(PRO_DEMO, ['form-rebase']).flatMap((source) => source.globs).map((glob) => glob.replace(/^(!?)\//, '$1')));
    expect(kept).not.toContain('packages/pro/src/form-rebase/FormRebase.example.tsx');
  });

  it('the virtual module: two eager globs per folder on the same patterns, nothing of packages/pro in the Free build', () => {
    const free = exampleSourcesModule(exampleSources(FREE));
    expect(free).not.toContain('packages/pro');
    expect(free.match(/import\.meta\.glob\(\["\/packages\/core\/src\/\*\*\/\*\.example\.tsx"\], \{ eager: true/g)).toHaveLength(2);
    expect(free).toContain("query: '?raw', import: 'default'");
    const complete = exampleSourcesModule(exampleSources({}));
    expect(complete).toContain('root: "packages/pro/src"');
    expect(exampleSourcesModule(exampleSources(PRO_DEMO))).not.toContain('"!/packages/pro/src/');
    expect(exampleSourcesModule(exampleSources(PRO_DEMO, ['form-rebase']))).toContain('"!/packages/pro/src/form-rebase/**"');
    expect(exampleSourcesModule(exampleSources(PRO_DEMO))).not.toContain('packages/core');
  });

  it('the plugin serves the module of its environment under the virtual id only', () => {
    const plugin = exampleSourcesPlugin({ env: FREE });
    expect(plugin.resolveId(EXAMPLE_SOURCES_MODULE)).toBe(`\0${EXAMPLE_SOURCES_MODULE}`);
    expect(plugin.resolveId('./other')).toBeNull();
    expect(plugin.load(`\0${EXAMPLE_SOURCES_MODULE}`)).toBe(exampleSourcesModule(exampleSources(FREE)));
    expect(plugin.load(EXAMPLE_SOURCES_MODULE)).toBeNull();
    // Wired into Storybook's Vite config (main.ts), next to the other plugins.
    expect(readFileSync(resolve(ROOT, '.storybook/main.ts'), 'utf8')).toMatch(/plugins: \[.*exampleSourcesPlugin\(\)\],/);
  });
});

describe('referenceFixtures (#402)', () => {
  it('are in the complete build only, never in the Free deploy or the Pro demo', () => {
    expect(referenceFixtures({})).toEqual(['./fixtures/*.mdx']);
    expect(referenceFixtures({ STORYBOOK_EXCLUDE_PRO: '1' })).toEqual([]);
    expect(referenceFixtures({ STORYBOOK_EDITION: 'pro' })).toEqual([]);
    expect(existsSync(resolve(ROOT, '.storybook/fixtures/TypeReferenceFixture.mdx'))).toBe(true);
  });
});

describe('referencePages (#402)', () => {
  it('adds the reference pages to the Free and complete builds, not to the Pro demo', () => {
    expect(referencePages({})).toEqual(['./reference/*.mdx']);
    expect(referencePages({ STORYBOOK_EXCLUDE_PRO: '1' })).toEqual(['./reference/*.mdx']);
    expect(referencePages({ STORYBOOK_EDITION: 'pro' })).toEqual([]);
    // The glob (relative to .storybook/) matches the page that exists.
    expect(existsSync(resolve(ROOT, '.storybook/reference/ListReportReference.mdx'))).toBe(true);
    expect(micromatch.isMatch('reference/ListReportReference.mdx', referencePages({})[0].replace(/^\.\//, ''))).toBe(true);
  });
});
