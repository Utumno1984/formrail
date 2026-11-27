import { describe, expect, it } from 'vitest';
import { findHappyPath, planEdgeCasesSection, plannedDocsOrder } from './story-example';

const s = (id: string, ...tags: string[]) => ({ id, tags });

describe('happy path first, edge cases last (#723)', () => {
  it('puts the happy path first and the edge cases after every other story, each group in index order', () => {
    const stories = [s('a'), s('edge-1', 'edge-case'), s('b'), s('happy', 'happy-path'), s('edge-2', 'visual', 'edge-case')];
    const { main, edgeCases } = planEdgeCasesSection(stories);
    expect(main.map((x) => x.id)).toEqual(['happy', 'a', 'b']);
    expect(edgeCases.map((x) => x.id)).toEqual(['edge-1', 'edge-2']);
  });

  it('leaves a page without tags exactly as it was', () => {
    const stories = [s('a'), s('b', 'visual'), s('c')];
    expect(planEdgeCasesSection(stories)).toEqual({ main: stories, edgeCases: [] });
  });

  it('throws on two happy paths and on a story tagged both happy-path and edge-case', () => {
    expect(() => findHappyPath([s('x', 'happy-path'), s('y', 'happy-path')])).toThrow(/More than one story tagged "happy-path"/);
    expect(() => planEdgeCasesSection([s('x', 'happy-path', 'edge-case')])).toThrow(/tagged both/);
  });

  it('plans the whole page: example, Playground, happy path, others, edge cases, then the use cases', () => {
    const order = plannedDocsOrder(
      [
        s('example', 'example'),
        s('playground', 'playground'),
        s('edge', 'edge-case'),
        s('other'),
        s('happy', 'happy-path'),
        s('use-case', 'use-case', 'vertical:erp'),
        s('hidden-use-case', 'use-case', 'vertical:erp', 'internal'),
      ],
      'Floorplans/List Report',
    );
    expect(order).toEqual(['example', 'playground', 'happy', 'other', 'edge', 'use-case']);
  });
});
