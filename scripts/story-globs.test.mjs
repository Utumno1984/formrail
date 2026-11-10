import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { excludePro, introductionPages, previewAnnotations, proEdition, storyGlobs } from '../.storybook/story-globs.mjs';

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
      expect(storyGlobs(env)).toEqual(['../packages/pro/src/**/*.stories.tsx', './ProIntroduction.mdx']);
      expect(introductionPages(env)).toEqual([]);
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
