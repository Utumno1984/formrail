import { describe, expect, it } from 'vitest';
import { isSingleNeutralStory, planUseCasesSection, USE_CASES_INTRO, VERTICALS, parseUseCaseDescription, splitUseCases, useCaseStory, sectionHeadingOf, verticalTags } from './story-example';

describe('VERTICALS (#624)', () => {
  it('is the closed list, with the labels the reader sees', () => {
    expect(VERTICALS.map((v) => [v.id, v.label])).toEqual([
      ['erp', 'ERP'],
      ['b2b', 'B2B'],
      ['e-commerce', 'E-commerce'],
      ['e-learning', 'E-learning'],
      ['helpdesk', 'Helpdesk'],
      ['hr', 'HR'],
    ]);
  });
});

describe('useCaseStory (#624)', () => {
  it('produces the description with both parts, and nothing but `parameters` (no tags a spread could carry)', () => {
    const story = useCaseStory({ vertical: 'erp', problem: 'Two operators edit one record.', configuration: 'Pass `itemLabel`.' });
    expect(story).toEqual({ parameters: { docs: { description: { story: '**Problem.** Two operators edit one record.\n\n**Configuration.** Pass `itemLabel`.' } } } });
    // The tags are written literally on the story (the indexer reads them statically): a spread must not bring any.
    expect(Object.keys(story)).toEqual(['parameters']);
  });

  it('a Free example may carry no description at all', () => {
    expect(useCaseStory({ vertical: 'hr' })).toEqual({ parameters: {} });
  });

  it('throws on a vertical outside the list, naming the allowed ids', () => {
    // @ts-expect-error: the type already refuses it; the runtime check is for untyped callers
    expect(() => useCaseStory({ vertical: 'invoicing' })).toThrow('use one of erp, b2b, e-commerce, e-learning, helpdesk, hr');
  });
});

describe('parseUseCaseDescription (#624)', () => {
  it('reads the two parts, in either order', () => {
    expect(parseUseCaseDescription('**Problem.** a\n\n**Configuration.** b')).toEqual({ problem: 'a', configuration: 'b' });
    expect(parseUseCaseDescription('**Configuration.** b\n\n**Problem.** a')).toEqual({ problem: 'a', configuration: 'b' });
  });

  it('a missing, blank or undefined part is empty', () => {
    expect(parseUseCaseDescription('**Problem.** a')).toEqual({ problem: 'a', configuration: '' });
    expect(parseUseCaseDescription('**Problem.**   \n\n**Configuration.** b')).toEqual({ problem: '', configuration: 'b' });
    expect(parseUseCaseDescription(undefined)).toEqual({ problem: '', configuration: '' });
  });
});

describe('page helpers (#624)', () => {
  it('names the section by the edition of the page, and keeps the intro sentence fixed', () => {
    expect(sectionHeadingOf('Floorplans/List Report')).toBe('Examples');
    expect(sectionHeadingOf('Pro/Patterns/Form rebase')).toBe('Use cases');
    expect(sectionHeadingOf('Production/X')).toBe('Examples');
    expect(USE_CASES_INTRO).toBe('The same component, configured for different kinds of records. The domain lives in the configuration, never in the component.');
  });

  it('lists the vertical tags as written', () => {
    expect(verticalTags(['autodocs', 'vertical:erp', 'vertical:nope'])).toEqual(['vertical:erp', 'vertical:nope']);
    expect(verticalTags(undefined)).toEqual([]);
  });

  it('splits neutral stories from use cases, keeping the order of each', () => {
    const stories = [
      { id: 'a', tags: [] },
      { id: 'b', tags: ['use-case'] },
      { id: 'c', tags: ['use-case', 'internal'] },
      { id: 'd', tags: ['internal'] },
    ];
    const split = splitUseCases(stories, true);
    expect(split.neutral.map((s) => s.id)).toEqual(['a', 'd']);
    // the internal use case is a hidden variant on a public page: in neither list
    expect(split.useCases.map((s) => s.id)).toEqual(['b']);
  });

  it('a file is a single-story page when ONE story is left without its use cases (Storybook counts the whole file)', () => {
    expect(isSingleNeutralStory([{ id: 'default', tags: [] }])).toBe(true);
    expect(isSingleNeutralStory([{ id: 'default' }, { id: 'erp', tags: ['use-case', 'vertical:erp'] }, { id: 'hr', tags: ['use-case', 'vertical:hr'] }])).toBe(true);
    expect(isSingleNeutralStory([{ id: 'default' }, { id: 'disabled', tags: ['internal'] }, { id: 'erp', tags: ['use-case'] }])).toBe(false);
    expect(isSingleNeutralStory([{ id: 'erp', tags: ['use-case'] }])).toBe(false);
  });

  it('on a page of fixtures (internal) every use case counts', () => {
    const stories = [{ id: 'b', tags: ['use-case', 'internal'] }];
    expect(splitUseCases(stories, false).useCases.map((s) => s.id)).toEqual(['b']);
  });
});

describe('planUseCasesSection on a Pro page (#624)', () => {
  const story = (id: string, vertical?: string, description?: string) => ({
    id,
    tags: vertical ? ['use-case', `vertical:${vertical}`] : [],
    description,
  });
  const stories = [
    story('playground'),
    story('erp', 'erp', useCaseStory({ vertical: 'erp', problem: 'p1', configuration: 'c1' }).parameters.docs?.description.story),
    story('b2b', 'b2b', useCaseStory({ vertical: 'b2b', problem: 'p2', configuration: 'c2' }).parameters.docs?.description.story),
    story('hr', 'hr', useCaseStory({ vertical: 'hr', problem: 'p3', configuration: 'c3' }).parameters.docs?.description.story),
  ];

  it('titles the section "Use cases", with the fixed intro, the three cases last and the neutral story apart', () => {
    const plan = planUseCasesSection('Pro/Patterns/Form rebase', stories, true);
    expect(plan.neutral.map((s) => s.id)).toEqual(['playground']);
    expect(plan.section?.heading).toBe('Use cases');
    expect(plan.section?.intro).toBe(USE_CASES_INTRO);
    expect(plan.section?.stories.map((s) => s.id)).toEqual(['erp', 'b2b', 'hr']);
  });

  it('each case carries its Problem and its Configuration', () => {
    const plan = planUseCasesSection('Pro/X', stories, true);
    expect(plan.section?.stories.map((s) => parseUseCaseDescription(s.description))).toEqual([
      { problem: 'p1', configuration: 'c1' },
      { problem: 'p2', configuration: 'c2' },
      { problem: 'p3', configuration: 'c3' },
    ]);
  });

  it('a Free title says "Examples"; a page without use cases has no section', () => {
    expect(planUseCasesSection('Floorplans/X', stories, true).section?.heading).toBe('Examples');
    expect(planUseCasesSection('Pro/X', [story('a')], true).section).toBeNull();
  });
});
