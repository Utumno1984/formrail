import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { excludePro, previewAnnotations, storyGlobs } from '../.storybook/story-globs.mjs';

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
