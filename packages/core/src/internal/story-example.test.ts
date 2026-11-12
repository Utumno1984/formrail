import { describe, expect, it } from 'vitest';
import { githubSource, REPOSITORY_MAIN, showcaseFiles } from './story-example';

describe('showcaseFiles (#403)', () => {
  const sources = { './A.tsx': 'code of A', './b.ts': 'code of b' };

  it('derives the repository path from the folder and the file name, and the text from the glob', () => {
    expect(showcaseFiles('packages/x/src/showcase', sources, { 'A.tsx': 'note A', 'b.ts': 'note b' })).toEqual([
      { path: 'packages/x/src/showcase/A.tsx', code: 'code of A', note: 'note A' },
      { path: 'packages/x/src/showcase/b.ts', code: 'code of b', note: 'note b' },
    ]);
  });

  it('keeps the order of the notes, not the one of the glob', () => {
    expect(showcaseFiles('f', sources, { 'b.ts': '', 'A.tsx': '' }).map((file) => file.path)).toEqual(['f/b.ts', 'f/A.tsx']);
  });

  it('throws on a listed name with no file next to the stories, naming folder and file', () => {
    expect(() => showcaseFiles('packages/x/src/showcase', sources, { 'Gone.tsx': 'note' })).toThrow('packages/x/src/showcase/Gone.tsx: no such file next to the stories');
  });

  it('accepts a file whose text is empty (only a missing file throws)', () => {
    expect(showcaseFiles('f', { './Empty.ts': '' }, { 'Empty.ts': 'n' })[0]?.code).toBe('');
  });
});

describe('githubSource (#403)', () => {
  it('is built on main, without doubled slashes', () => {
    expect(githubSource('/packages/a.ts')).toBe(`${REPOSITORY_MAIN}packages/a.ts`);
  });
});
