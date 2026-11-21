import { describe, expect, it } from 'vitest';
import { auditNeutralDocs, findDomainTerms, neutralDocsStories, type NeutralDocsBaseline, type NeutralFinding } from './neutral-docs-guard';

const terms = (text: string) => findDomainTerms(text).map((finding) => finding.term);

describe('findDomainTerms', () => {
  it('finds whole words in any case', () => {
    expect(terms('Customer')).toEqual(['customer']);
    expect(terms('PURCHASE   order')).toEqual(['purchase order']);
  });

  it('finds plurals, which findDomainTerm does not', () => {
    expect(terms('Invoices')).toEqual(['invoice']);
    expect(terms('All customers')).toEqual(['customer']);
    expect(terms('3 SKUs')).toEqual(['sku']);
    expect(terms('open support cases')).toEqual(['support case']);
    expect(terms('Checkouts')).toEqual(['checkout']);
    expect(terms('tickets')).toEqual(['ticket']);
  });

  it('does not match a term inside a longer word', () => {
    expect(terms('Productivity')).toEqual([]);
    expect(terms('a carton of stockings')).toEqual([]);
    expect(terms('Customerize')).toEqual([]);
  });

  it('ignores person names and right-to-left text', () => {
    expect(terms('Maria Rossi, Ahmed Al-Farsi')).toEqual([]);
    expect(terms('مرحبا بالعالم שלום עולם')).toEqual([]);
  });

  it('quotes an excerpt around the match', () => {
    expect(findDomainTerms('Pick the Invoices to approve')[0]!.excerpt).toBe('Pick the Invoices to approve');
  });
});

describe('neutralDocsStories', () => {
  const docs = new Set(['Components/Button', 'Showcase/Orders', 'Components/NoDocs2']);
  it('keeps the neutral stories of public Docs pages only', () => {
    const pages = neutralDocsStories(
      [
        { id: 'b--playground', title: 'Components/Button', tags: ['autodocs'] },
        { id: 'b--use-case', title: 'Components/Button', tags: ['autodocs', 'use-case'] },
        { id: 'b--fixture', title: 'Components/Button', tags: ['autodocs', 'internal'] },
        { id: 's--x', title: 'Showcase/Orders', tags: [] },
        { id: 'n--x', title: 'Components/NoDocs', tags: [] },
      ],
      docs,
    );
    expect([...pages.keys()]).toEqual(['Components/Button']);
    expect(pages.get('Components/Button')!.map((story) => story.id)).toEqual(['b--playground']);
  });
});

describe('auditNeutralDocs', () => {
  const found = (title: string, term: string): NeutralFinding => ({ title, storyId: `${title}--playground`, term, excerpt: `a ${term} here` });
  const baseline = (pages: Record<string, string[]>): NeutralDocsBaseline => ({ version: 1, pages });

  it('passes a clean page outside the baseline', () => {
    expect(auditNeutralDocs(['A'], [], baseline({}))).toEqual([]);
  });

  it('fails a page outside the baseline, naming the story, the term and an excerpt', () => {
    const problems = auditNeutralDocs(['A'], [found('A', 'customer')], baseline({}));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('A--playground');
    expect(problems[0]).toContain('"customer"');
    expect(problems[0]).toContain('a customer here');
  });

  it('accepts the listed terms of a page in the baseline, fails a new one', () => {
    expect(auditNeutralDocs(['A'], [found('A', 'invoice')], baseline({ A: ['invoice'] }))).toEqual([]);
    const problems = auditNeutralDocs(['A'], [found('A', 'invoice'), found('A', 'cart')], baseline({ A: ['invoice'] }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"cart"');
  });

  it('asks to remove a listed page that has no term left', () => {
    expect(auditNeutralDocs(['A'], [], baseline({ A: ['invoice'] }))[0]).toContain('remove it from the baseline');
  });

  it('asks to narrow the entry of a listed page when a term is gone', () => {
    const problems = auditNeutralDocs(['A'], [found('A', 'cart')], baseline({ A: ['cart', 'invoice'] }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"invoice" is no longer');
  });

  it('fails an entry that matches no page', () => {
    expect(auditNeutralDocs(['A'], [], baseline({ Gone: ['cart'] }))[0]).toContain('not a public Docs page');
  });
});
