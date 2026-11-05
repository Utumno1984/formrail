// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hoverRules, stripComments } from './helpers/css-analysis';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(packageDir, 'src');
const stylesCss = readFileSync(join(packageDir, 'dist/styles.css'), 'utf8');

const HOVER_MEDIA = '@media (hover: hover) and (pointer: fine)';

/**
 * Known exceptions, each with the reason and the ticket that removes it. An entry with no
 * occurrence left makes the test fail, so the list cannot rot.
 */
const SOURCE_ALLOWLIST: Record<string, string> = {};
const CSS_ALLOWLIST: RegExp[] = [];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(name) || /\.(stories|test)\.tsx?$/.test(name)) return [];
    return [path];
  });
}

describe('hover affordance convention (#196)', () => {
  it('compiled styles.css: every :hover rule sits under (hover: hover) and (pointer: fine)', () => {
    const hits = hoverRules(stylesCss);
    expect(hits.length).toBeGreaterThan(0);
    const bad = hits.filter(
      (h) => !h.media.includes(HOVER_MEDIA) && !CSS_ALLOWLIST.some((re) => re.test(h.selector)),
    );
    expect(bad.map((h) => h.selector)).toEqual([]);
    // No rule is guarded by the weaker `(hover: hover)` alone, apart from the allowlisted ones.
    const weak = hits.filter(
      (h) => h.media.some((m) => /^@media \(hover: hover\)$/.test(m)) && !CSS_ALLOWLIST.some((re) => re.test(h.selector)),
    );
    expect(weak.map((h) => h.selector)).toEqual([]);
  });

  it('the CSS allowlist has no stale entry', () => {
    for (const re of CSS_ALLOWLIST) {
      expect(hoverRules(stylesCss).some((h) => re.test(h.selector)), String(re)).toBe(true);
    }
  });

  it('library source has no bare hover:, group-hover or peer-hover (only rop-hover:), apart from the allowlist', () => {
    const bare = /(?<![\w-])hover:|group-hover|peer-hover/;
    const found = new Set<string>();
    for (const file of sourceFiles(srcDir)) {
      const text = stripComments(readFileSync(file, 'utf8')).replace(/^\s*\/\/.*$/gm, '');
      if (bare.test(text)) found.add(relative(srcDir, file).split('\\').join('/'));
    }
    const unexpected = [...found].filter((f) => !(f in SOURCE_ALLOWLIST));
    expect(unexpected).toEqual([]);
    const stale = Object.keys(SOURCE_ALLOWLIST).filter((f) => !found.has(f));
    expect(stale, 'allowlist entries without an occurrence').toEqual([]);
  });
});
