import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import micromatch from 'micromatch';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRO_DEMO_NOT_PUBLIC, excludePro, introductionPages, previewAnnotations, proEdition, referencePages, storyGlobs } from '../.storybook/story-globs.mjs';

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
      expect(storyGlobs(env)).toEqual(['../packages/pro/src/!(form-rebase)/**/*.stories.tsx', './ProIntroduction.mdx']);
      expect(introductionPages(env)).toEqual([]);
    });

    it('leaves the not-yet-public Form rebase story out of the Pro demo only (#421)', () => {
      for (const mode of [{}, { STORYBOOK_EXCLUDE_PRO: '1' }]) {
        expect(storyGlobs(mode).some((g) => g.includes('form-rebase') || g.includes('!('))).toBe(false);
      }
      // Each exclusion must point at a real folder, or it would silently exclude nothing.
      for (const dir of PRO_DEMO_NOT_PUBLIC) expect(existsSync(resolve(ROOT, 'packages/pro/src', dir))).toBe(true);
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
