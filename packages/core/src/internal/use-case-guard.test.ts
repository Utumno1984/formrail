import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GITHUB_SLUGGER_REMOVED } from './github-slugger-regex';
import { PRO_MIN_USE_CASE_VERTICALS, PRO_USE_CASES_PENDING, auditProRatchet, auditUseCaseStructure, slugOf, type IndexedStory } from './use-case-guard';

let n = 0;
const neutral = (title: string, name = 'Default', tags: string[] = []): IndexedStory => ({ id: `s${++n}`, title, name, tags: ['autodocs', ...tags] });
const useCase = (title: string, vertical: string | null, name = 'Example: configured for something', tags: string[] = []): IndexedStory => ({
  id: `s${++n}`,
  title,
  name,
  tags: ['autodocs', 'use-case', ...(vertical ? [`vertical:${vertical}`] : []), ...tags],
});
const good = '**Problem.** p\n\n**Configuration.** c';

describe('auditUseCaseStructure (#624)', () => {
  it('accepts a page with neutral stories first and one use case last (one is enough on a Free page)', () => {
    expect(auditUseCaseStructure([neutral('X/A'), useCase('X/A', 'erp')])).toEqual([]);
  });

  it('rule: a use case is named "Example: ..."', () => {
    const bad = useCase('X/A', 'erp', 'Sample: configured for X');
    expect(auditUseCaseStructure([neutral('X/A'), bad])).toEqual([expect.stringContaining(`Sample: configured for X (${bad.id})`)]);
  });

  it('rule: a use case has exactly one vertical tag (none, two)', () => {
    const none = useCase('X/A', null);
    expect(auditUseCaseStructure([neutral('X/A'), none])).toContainEqual(expect.stringContaining(`(${none.id}): a "use-case" story has exactly one "vertical:<id>" tag (found 0)`));
    const two = useCase('X/B', 'erp', undefined, ['vertical:hr']);
    expect(auditUseCaseStructure([neutral('X/B'), two])).toContainEqual(expect.stringContaining('(found 2)'));
  });

  it('rule: the vertical id is in the closed list, and the message names the allowed ids', () => {
    const bad = useCase('X/A', 'invoicing');
    expect(auditUseCaseStructure([neutral('X/A'), bad])).toEqual([expect.stringContaining('unknown vertical "invoicing" (allowed: erp, b2b, e-commerce, e-learning, helpdesk, hr)')]);
  });

  it('rule: a public story named "Example: ..." that is not a use case fails; an internal one does not', () => {
    const impostor = neutral('X/A', 'Example: configured for ERP');
    expect(auditUseCaseStructure([impostor])).toEqual([expect.stringContaining(`(${impostor.id}): a public story named "Example: ..." must be tagged "use-case"`)]);
    expect(auditUseCaseStructure([neutral('X/A', 'Example: fixture', ['internal'])])).toEqual([]);
  });

  it('rule: a use case never precedes a neutral story of the same page, even from another file', () => {
    const late = neutral('X/A', 'Late');
    const problems = auditUseCaseStructure([neutral('X/A'), useCase('X/A', 'erp'), late]);
    expect(problems).toEqual([expect.stringContaining(`X/A / Late (${late.id}): comes after the use case`)]);
  });

  it('the order is per page: another page does not matter', () => {
    expect(auditUseCaseStructure([neutral('X/A'), useCase('X/A', 'erp'), neutral('X/B')])).toEqual([]);
  });

  it('rule: a page opens on a neutral story, never on a use case (alone, or only use cases)', () => {
    const alone = useCase('X/A', 'erp');
    expect(auditUseCaseStructure([alone])).toEqual([expect.stringContaining(`X/A / Example: configured for something (${alone.id}): no neutral story before the first use case`)]);
    const firstOfTwo = useCase('X/B', 'erp');
    expect(auditUseCaseStructure([firstOfTwo, useCase('X/B', 'hr')])).toEqual([expect.stringContaining(`(${firstOfTwo.id}): no neutral story before the first use case`)]);
    // An internal neutral story does not count: the reader of a public page sees the domain example first.
    const afterHidden = useCase('X/C', 'erp');
    expect(auditUseCaseStructure([neutral('X/C', 'Hidden', ['internal']), afterHidden])).toEqual([expect.stringContaining(`(${afterHidden.id}): no neutral story before the first use case`)]);
  });

  it('rule: the first story is the first `autodocs` one, the template\'s primary (a use case cannot become it)', () => {
    // Every neutral story is `!autodocs` (no `autodocs` tag in the index), the use case is the only documented one.
    const hidden = { ...neutral('X/A', 'Default'), tags: [] as string[] };
    const uc = useCase('X/A', 'erp');
    expect(auditUseCaseStructure([hidden, uc])).toEqual([expect.stringContaining(`(${uc.id}): no neutral story before the first use case`)]);
    // With a documented neutral story before it the page is in order, whatever the hidden ones.
    expect(auditUseCaseStructure([hidden, neutral('X/A', 'Documented'), uc])).toEqual([]);
    // A page with no `autodocs` story at all has no Docs page: the first visible story decides, as before.
    expect(auditUseCaseStructure([hidden, { ...uc, tags: ['use-case', 'vertical:erp'] }])).toEqual([]);
  });

  it('rule: no neutral story named like the section heading (duplicate id "examples" / "use-cases") on a page with use cases', () => {
    const clash = neutral('X/A', 'Examples');
    expect(auditUseCaseStructure([neutral('X/A'), clash, useCase('X/A', 'erp')])).toEqual([expect.stringContaining(`(${clash.id}): a page with use cases cannot have a story named "Examples"`)]);
    // Same slug from another spelling, and the Pro id.
    const spelled = neutral('Pro/Z', 'Use Cases!');
    expect(auditUseCaseStructure([neutral('Pro/Z'), spelled, useCase('Pro/Z', 'erp', 'Example: configured for a Pro thing')])).toContainEqual(expect.stringContaining(`(${spelled.id}): a page with use cases cannot have a story named "Use Cases!"`));
    // A page without use cases may have such a story: there is no section.
    expect(auditUseCaseStructure([neutral('X/B', 'Examples')])).toEqual([]);
    // "Examples" is not the Pro section's id: no clash on a Pro page.
    expect(auditUseCaseStructure([neutral('Pro/Y', 'Examples'), useCase('Pro/Y', 'erp')]).filter((p) => p.includes('cannot have a story'))).toEqual([]);
  });

  it.each(['Exam.ples', "Ex'amples", "Example's", 'EXAMPLES'])('rule: "%s" has the slug "examples" in Storybook, so it clashes', (name) => {
    const clash = neutral('X/A', name);
    expect(auditUseCaseStructure([neutral('X/A'), clash, useCase('X/A', 'erp')])).toContainEqual(expect.stringContaining(`(${clash.id}): a page with use cases cannot have a story named`));
  });

  it.each(['Use_Cases', 'Use  Cases', 'examples '])('rule: "%s" does not have the slug of a section heading, so it is not a clash', (name) => {
    expect(auditUseCaseStructure([neutral('Pro/Z'), neutral('Pro/Z', name), useCase('Pro/Z', 'erp')]).filter((p) => p.includes('cannot have a story'))).toEqual([]);
    expect(auditUseCaseStructure([neutral('X/A'), neutral('X/A', name), useCase('X/A', 'erp')]).filter((p) => p.includes('cannot have a story'))).toEqual([]);
  });

  it('rule: the name rule does not apply to a page of one neutral story (no heading is rendered for it)', () => {
    // `isSingleNeutralStory` pages (one neutral story, then the use cases) show no heading for the neutral story.
    expect(auditUseCaseStructure([neutral('X/A', 'Examples'), useCase('X/A', 'erp')])).toEqual([]);
    const pro = useCase('Pro/Z', 'erp');
    expect(auditUseCaseStructure([neutral('Pro/Z', 'Use cases'), pro], { [pro.id]: good })).toEqual([]);
  });

  it('slugOf uses the github-slugger regex bundled in the installed Storybook (the copy is verbatim)', () => {
    const bundle = readFileSync(resolve(process.cwd(), '../../node_modules/@storybook/addon-docs/dist/blocks.js'), 'utf8');
    const line = bundle.split('\n').find((l) => l.startsWith('var regex = /'));
    expect(line).toBeDefined();
    const source = /^var regex = \/(.*)\/g?;?$/.exec(line!.trim());
    expect(source).not.toBeNull();
    expect(GITHUB_SLUGGER_REMOVED.source).toBe(new RegExp(source![1]!, 'g').source);
    const reference = (text: string) => text.toLowerCase().replace(new RegExp(source![1]!, 'g'), '').replace(/ /g, '-');
    for (const text of ['Exam.ples', "Example's", 'Use_Cases', 'Use  Cases', 'examples ', 'Use Cases!', '\u24b6 Circled']) expect(slugOf(text)).toBe(reference(text));
    expect(slugOf("Example's")).toBe('examples');
    expect(slugOf('Use  Cases')).toBe('use--cases');
  });

  it('a page made only of fixtures (internal) is checked too: order, verticals and neutral first', () => {
    const fixture = (name = 'Default') => neutral('F/A', name, ['internal']);
    const useCaseFixture = (vertical: string) => useCase('F/A', vertical, 'Example: configured for a fixture', ['internal']);
    const late = fixture('Late');
    expect(auditUseCaseStructure([fixture(), useCaseFixture('erp'), late])).toEqual([expect.stringContaining(`F/A / Late (${late.id}): comes after the use case`)]);
    expect(auditUseCaseStructure([fixture(), useCaseFixture('erp'), useCaseFixture('erp')])).toEqual([expect.stringContaining('F/A: 2 use cases but only 1 distinct verticals (at least 2 needed)')]);
    const first = useCaseFixture('erp');
    expect(auditUseCaseStructure([first])).toEqual([expect.stringContaining(`(${first.id}): no neutral story before the first use case`)]);
    expect(auditUseCaseStructure([fixture(), useCaseFixture('erp'), useCaseFixture('hr')])).toEqual([]);
  });

  it('rule: n use cases cover min(n, 3) distinct verticals', () => {
    const page = (verticals: string[]) => [neutral('X/A'), ...verticals.map((v) => useCase('X/A', v))];
    expect(auditUseCaseStructure(page(['erp', 'erp']))).toEqual([expect.stringContaining('X/A: 2 use cases but only 1 distinct verticals (at least 2 needed)')]);
    expect(auditUseCaseStructure(page(['erp', 'hr', 'hr', 'hr']))).toEqual([expect.stringContaining('4 use cases but only 2 distinct verticals (at least 3 needed)')]);
    expect(auditUseCaseStructure(page(['erp', 'hr', 'b2b', 'b2b']))).toEqual([]);
    expect(auditUseCaseStructure(page(['erp']))).toEqual([]);
  });

  it('counts per page, not per file: stories of two files of one title add up', () => {
    // same title, listed one after the other as the index does for several files
    expect(auditUseCaseStructure([neutral('X/A'), useCase('X/A', 'erp'), useCase('X/A', 'hr')])).toEqual([]);
  });

  it('an internal use-case variant does not count as a vertical but keeps its tag checked', () => {
    const variant = useCase('X/A', 'hr', 'Example: variant', ['internal']);
    expect(auditUseCaseStructure([neutral('X/A'), useCase('X/A', 'erp'), useCase('X/A', 'erp'), variant])).toEqual([
      expect.stringContaining('2 use cases but only 1 distinct verticals'),
    ]);
    const noTag = useCase('X/A', null, 'Example: variant', ['internal']);
    expect(auditUseCaseStructure([neutral('X/A'), noTag])).toEqual([expect.stringContaining('exactly one "vertical:<id>" tag')]);
  });

  it('rule: a Pro use case describes both the problem and the configuration, non-empty', () => {
    const story = useCase('Pro/X', 'erp');
    const audit = (description?: string) => auditUseCaseStructure([neutral('Pro/X'), story], { [story.id]: description });
    expect(audit(good)).toEqual([]);
    expect(audit(undefined)).toEqual([expect.stringContaining('**Problem.**'), expect.stringContaining('**Configuration.**')]);
    expect(audit('**Problem.** p')).toEqual([expect.stringContaining('**Configuration.**')]);
    expect(audit('**Problem.** \n\n**Configuration.** c')).toEqual([expect.stringContaining('**Problem.**')]);
  });

  it('a Free use case needs no description', () => {
    expect(auditUseCaseStructure([neutral('X/A'), useCase('X/A', 'erp')])).toEqual([]);
  });
});

describe('auditProRatchet (#624)', () => {
  const proPage = (title: string, verticals: string[]) => [neutral(title), ...verticals.map((v) => useCase(title, v))];
  const three = ['erp', 'b2b', 'hr'];

  it('the pending list starts with exactly the six pages of the ticket, and the minimum is 3', () => {
    expect([...PRO_USE_CASES_PENDING]).toEqual([
      'Pro/ChangeSummary',
      'Pro/Patterns/Form rebase',
      'Pro/RebaseNotice',
      'Pro/Floorplans/Virtual List Report',
      'Pro/Integrations/React Hook Form',
      'Pro/Integrations/TanStack Form',
    ]);
    expect(PRO_MIN_USE_CASE_VERTICALS).toBe(3);
  });

  it('accepts a page in order that is not listed, and a listed page that is not', () => {
    expect(auditProRatchet([...proPage('Pro/A', three), ...proPage('Pro/B/C', ['erp'])], ['Pro/B/C'])).toEqual([]);
  });

  it('fails on a new Pro page that is not in order and not listed, saying how many verticals are missing', () => {
    expect(auditProRatchet(proPage('Pro/A', ['erp', 'hr']), [])).toEqual([expect.stringContaining('Pro/A: a Pro page needs "Use cases" on at least 3 verticals (has 2, 1 missing)')]);
  });

  it('fails on a listed page that is already in order ("remove it from the list")', () => {
    expect(auditProRatchet(proPage('Pro/A', three), ['Pro/A'])).toEqual([expect.stringContaining('Pro/A: already has 3 verticals, remove it from PRO_USE_CASES_PENDING')]);
  });

  it('fails on an entry that matches no page', () => {
    expect(auditProRatchet(proPage('Pro/A', three), ['Pro/Gone'])).toEqual([expect.stringContaining('lists "Pro/Gone", which is not a Pro page of this build')]);
  });

  it('a nested Pro title is a Pro page; a showcase, a fixture-only page and a Free page are not', () => {
    const stories = [neutral('Pro/Patterns/Form rebase'), neutral('Pro/Showcase/Editing'), neutral('Pro/Internal/Fixture', 'Default', ['internal']), neutral('Floorplans/List Report')];
    expect(auditProRatchet(stories, ['Pro/Patterns/Form rebase'])).toEqual([]);
    expect(auditProRatchet(stories, [])).toEqual([expect.stringContaining('Pro/Patterns/Form rebase')]);
  });

  it('a build without Pro pages (the Free one) passes, entries included', () => {
    expect(auditProRatchet([neutral('Floorplans/List Report')])).toEqual([]);
  });

  it('counts per page: internal variants do not add verticals', () => {
    const stories = [...proPage('Pro/A', ['erp', 'hr']), useCase('Pro/A', 'b2b', 'Example: variant', ['internal'])];
    expect(auditProRatchet(stories, [])).toEqual([expect.stringContaining('has 2, 1 missing')]);
  });
});
