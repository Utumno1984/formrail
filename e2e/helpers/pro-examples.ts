import { readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';

// Ticket #447: which Storybook build carries the text of which Pro copy-paste example. A build carries an
// example's text when one of its assets holds the example's `export function Name(` line: the "Show code" text
// (`?raw`) is a string in the bundle, and that line has no quote or backslash a bundler would escape.

export interface ProExample {
  /** Repository path (`packages/pro/src/change-summary/ChangeSummary.example.tsx`). */
  file: string;
  /** Its folder directly under packages/pro/src (`change-summary`), as in `PRO_DEMO_NOT_PUBLIC`. */
  folder: string;
  /** A line of the file that only its text contains. */
  marker: string;
}

/** The `*.example.tsx` files of packages/pro, with their marker. */
export function proExamples(repoRoot: string): ProExample[] {
  const src = resolve(repoRoot, 'packages/pro/src');
  return readdirSync(src, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.example.tsx'))
    .map((path) => {
      const name = /^export function (\w+)\(/m.exec(readFileSync(resolve(src, path), 'utf8'))?.[1];
      if (!name) throw new Error(`${path}: no exported function`);
      const parts = path.split(sep);
      return { file: `packages/pro/src/${parts.join('/')}`, folder: parts[0]!, marker: `export function ${name}(` };
    });
}

/** The text of every JavaScript asset of a Storybook build folder, read once. */
export function buildText(dir: string): string {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.js'))
    .map((path) => readFileSync(resolve(dir, path), 'utf8'))
    .join('\n');
}
