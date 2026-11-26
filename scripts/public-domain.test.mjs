import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Ticket #667 ratchet: public links point at https://formrail.dev. The legacy github.io address may only
// appear where the old URLs are the subject (redirect tests, the README note). Adding a file here is a decision.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST = new Set([
  'README.md', // the note that the old address redirects
  'scripts/assemble-site.test.mjs',
  'scripts/legacy-story-ids.test.mjs',
  'scripts/public-domain.test.mjs',
]);

describe('github.io occurrences', () => {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((f) => f && !f.endsWith('CHANGELOG.md') && f !== 'package-lock.json' && !/\.(png|jpe?g|webp|woff2?|ico)$/.test(f));
  const found = new Set(files.filter((f) => readFileSync(resolve(ROOT, f), 'utf8').includes('github.io')));

  it('only the allowlisted files mention github.io', () => {
    expect([...found].filter((f) => !ALLOWLIST.has(f)).sort()).toEqual([]);
  });

  it('every allowlisted file still needs its entry', () => {
    expect([...ALLOWLIST].filter((f) => !found.has(f))).toEqual([]);
  });

  it('the public package links use formrail.dev', () => {
    expect(JSON.parse(readFileSync(resolve(ROOT, 'packages/core/package.json'), 'utf8')).homepage).toBe('https://formrail.dev/storybook/');
    for (const f of ['README.md', 'packages/core/README.md', 'CONTRIBUTING.md']) {
      expect(readFileSync(resolve(ROOT, f), 'utf8'), f).toContain('https://formrail.dev/');
    }
  });
});
