// Ticket #690: the Pro is distributed through GitHub Packages (decision of 2026-11-26). The spec (§2.4) and
// CLAUDE.md must say so, and the superseded private npm org may only appear as history, on a line that
// marks it as superseded. The spec is in English; CLAUDE.md is still in Italian, so both wordings are matched.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = resolve(ROOT, 'docs/planning/design-system-spec.md');
const CLAUDE = resolve(ROOT, 'CLAUDE.md');

const PRIVATE_ORG = /private\s+npm\s+org|npm\s+private\s+org|org\s+npm\s+privata|npm\s+org\s+privata/i;
const SUPERSEDED = /supersed|no\s+longer|superat|non\s+più/i;

/**
 * Sentences (paragraph-wise, line breaks normalised with `\s+`) that present the private npm org without
 * marking it as superseded within the same sentence, i.e. as the current choice.
 */
export const currentPrivateNpmOrgLines = (markdown) =>
  markdown
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' '))
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+(?=[A-Z*"`(])/))
    .filter((sentence) => PRIVATE_ORG.test(sentence) && !SUPERSEDED.test(sentence));

/** The text of §2.4 of the spec, up to the next `---` or `## ` heading. */
export const section24 = (spec) => {
  const rest = spec.slice(spec.indexOf('### 2.4'));
  const end = rest.search(/\n(?:---|## )/);
  return end === -1 ? rest : rest.slice(0, end);
};

describe('Pro distribution docs (#690)', () => {
  const spec = readFileSync(SPEC, 'utf8');
  const claude = readFileSync(CLAUDE, 'utf8');

  it('helper flags a private npm org line not marked as superseded', () => {
    expect(currentPrivateNpmOrgLines('The private npm org is used.')).toHaveLength(1);
    expect(currentPrivateNpmOrgLines('private npm org (superseded on 2026-11-26)')).toEqual([]);
    // phrase split across two lines
    expect(currentPrivateNpmOrgLines('The private npm\norg is used.')).toHaveLength(1);
    expect(currentPrivateNpmOrgLines('instead of the private npm\norg, superseded.')).toEqual([]);
    // a "superseded" in another sentence of the same paragraph does not excuse the mention
    expect(currentPrivateNpmOrgLines('The private npm org is used. Something else is superseded.')).toHaveLength(1);
    // the Italian wording, still used by CLAUDE.md, is matched too
    expect(currentPrivateNpmOrgLines("Si usa l'org npm privata.")).toHaveLength(1);
    expect(currentPrivateNpmOrgLines('org npm privata (superata il 2026-11-26)')).toEqual([]);
    expect(currentPrivateNpmOrgLines("Si usa l'org npm\nprivata.")).toHaveLength(1);
    expect(currentPrivateNpmOrgLines("al posto dell'org npm\nprivata, superata.")).toEqual([]);
    expect(currentPrivateNpmOrgLines("Si usa l'org npm privata. Altro è superato.")).toHaveLength(1);
  });

  it('spec §2.4 states GitHub Packages with the date and the reason', () => {
    const s24 = section24(spec);
    expect(s24).toContain('GitHub Packages');
    expect(s24).toContain('2026-11-26');
    expect(s24).toMatch(/paid/);
    expect(s24).toMatch(/fixed costs/);
    expect(s24).toContain('Maintainer decision, 2026-11-26');
    expect(s24).toContain('@formrail-dev/pro');
  });

  it('spec §2.4 and CLAUDE.md never present the private npm org as the current choice', () => {
    expect(currentPrivateNpmOrgLines(section24(spec))).toEqual([]);
    expect(currentPrivateNpmOrgLines(claude)).toEqual([]);
  });

  it('the whole spec has no current private npm org either', () => {
    expect(currentPrivateNpmOrgLines(spec)).toEqual([]);
  });

  it('CLAUDE.md cites GitHub Packages with the date and the private flag condition', () => {
    expect(claude).toContain('GitHub Packages');
    expect(claude).toContain('2026-11-26');
    expect(claude).toMatch(/"private": true` finché il pacchetto non è pubblicato su GitHub Packages/);
  });

  it('the formrail-dev org is no longer described as still to be created', () => {
    expect(spec).not.toMatch(/to be created by the maintainer/);
    expect(spec).not.toMatch(/until the `formrail-dev` org is created/);
    expect(spec).toMatch(/formrail-dev[^\n]*has existed since 2026-11-26/);
  });

  it('the MoR paragraph cites the decision point on registry access, not another one', () => {
    const m = spec.match(/see point (\d+) of the 2026-11-26 decisions/);
    expect(m).not.toBeNull();
    const item = spec.match(new RegExp(`^${m[1]}\\. \\*\\*([^*]+)\\*\\*`, 'm'));
    expect(item?.[1]).toMatch(/access|registry/i);
  });
});
