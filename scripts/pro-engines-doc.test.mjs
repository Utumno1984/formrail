// Ticket #489: the study of the Pro engines boundary exists, answers every question of the ticket under its own
// heading, lists the decisions left to Daniele, and is linked from §8 of the spec. The content is reviewed by
// the critic; this guards against the file or a section disappearing.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STUDY = resolve(ROOT, 'docs/planning/pro-engines-decoupling.md');
const SPEC = resolve(ROOT, 'docs/planning/design-system-spec.md');

/** One heading per question of the ticket, plus the sections the ticket asks for. */
export const REQUIRED_HEADINGS = [
  '## 1. Confine',
  "## 2. Cosa entra nell'entry dei motori",
  '## 3. `useFormRebase` generico',
  '## 4. Adattatori vs guida',
  '## 5. Baseline',
  '## 6. Applicare il rebase senza falsi dirty',
  '## 7. Semantica di "dirty"',
  '## Casi limite del ticket: stato',
  '## Ticket figli proposti',
  '## Decisioni aperte per Daniele',
];

/** The headings of `REQUIRED_HEADINGS` missing from `markdown` (a heading must be a whole line). */
export const missingHeadings = (markdown) => {
  const lines = new Set(markdown.split(/\r?\n/).map((line) => line.trimEnd()));
  return REQUIRED_HEADINGS.filter((heading) => !lines.has(heading));
};

describe('study of the Pro engines boundary (#489)', () => {
  it('exists', () => {
    expect(existsSync(STUDY)).toBe(true);
  });

  it('has a heading for every question of the ticket', () => {
    expect(missingHeadings(readFileSync(STUDY, 'utf8'))).toEqual([]);
  });

  it('lists the three open decisions with their options', () => {
    const open = readFileSync(STUDY, 'utf8').split('## Decisioni aperte per Daniele')[1] ?? '';
    for (const option of ['1a', '1b', '2a', '2b', '3a', '3b']) expect(open).toContain(`**${option}`);
  });

  it('cites the real code (file:line)', () => {
    const study = readFileSync(STUDY, 'utf8');
    for (const file of ['use-form-rebase.ts:', 'use-change-summary.ts:', 'tsup.config.ts:', 'index.esm.mjs:', 'FormApi.js:']) {
      expect(study).toContain(file);
    }
  });

  it('is linked from §8 of the spec', () => {
    const spec = readFileSync(SPEC, 'utf8');
    const section8 = spec.slice(spec.indexOf('## 8.'));
    expect(section8).toContain('](./pro-engines-decoupling.md)');
  });

  it('negative: a missing or renamed heading is reported', () => {
    const study = readFileSync(STUDY, 'utf8');
    expect(missingHeadings(study.replace('## 5. Baseline', '## 5. Base'))).toEqual(['## 5. Baseline']);
    expect(missingHeadings('')).toEqual(REQUIRED_HEADINGS);
    // A heading quoted inside a line does not count.
    expect(missingHeadings(`text ${REQUIRED_HEADINGS.join(' ')}`)).toEqual(REQUIRED_HEADINGS);
  });
});
