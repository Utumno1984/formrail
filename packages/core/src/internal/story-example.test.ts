import { describe, expect, it } from 'vitest';
import { CORE_STYLESHEET, exampleStylesheets, githubSource, PRO_STYLESHEET, REPOSITORY_MAIN, showcaseFiles } from './story-example';

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

describe('exampleStylesheets (#447)', () => {
  it('a core example needs the core stylesheet only', () => {
    expect(exampleStylesheets("import { Button } from '@formrail/core';\nexport function A() { return <Button />; }")).toEqual([CORE_STYLESHEET]);
  });

  it('an example that imports @formrail/pro needs core then Pro, in that order', () => {
    const code = "import { useObjectPageForm } from '@formrail/core';\nimport { ChangeSummary } from \"@formrail/pro\";\n";
    expect(exampleStylesheets(code)).toEqual(['@formrail/core/styles.css', '@formrail/pro/styles.css']);
    expect(exampleStylesheets("import type { ChangeEntry } from '@formrail/pro';")).toEqual([CORE_STYLESHEET, PRO_STYLESHEET]);
  });

  it('a mention that is not an import of @formrail/pro does not count', () => {
    expect(exampleStylesheets("// see @formrail/pro for the virtualized one\nimport { x } from '@formrail/professional';")).toEqual([CORE_STYLESHEET]);
  });
});

describe('githubSource (#403)', () => {
  it('is built on main, without doubled slashes', () => {
    expect(githubSource('/packages/a.ts')).toBe(`${REPOSITORY_MAIN}packages/a.ts`);
  });
});
