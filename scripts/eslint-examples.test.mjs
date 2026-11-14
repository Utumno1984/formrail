// #403: the lint rules that keep the copy-paste examples honest, tested against the repo's real
// eslint.config.js at file paths that do not need to exist:
// - what a `*.example.tsx` may import (`react` and `@formrail/*` only);
// - what a story built with `...exampleStory(...)` may not override (`render`, `component`, `decorators`, `loaders`).
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd });

async function messages(filePath, source, ruleId) {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter((m) => m.ruleId === ruleId).map((m) => m.message);
}

const EXAMPLE = 'packages/core/src/object-page/Some.example.tsx';
const importOf = (specifier) => `import * as x from '${specifier}';\nexport { x };\n`;

// The first lint loads the whole config (typescript-eslint, plugins): seconds, not milliseconds.
describe('lint: what a copy-paste example may import (#403)', { timeout: 60_000 }, () => {
  it.each(['zod', 'react-dom', 'react-dom/client', './sibling', '../other', '@formrail/core/internal', 'storybook/test', '@storybook/react-vite'])(
    '%s is rejected',
    async (specifier) => {
      expect((await messages(EXAMPLE, importOf(specifier), 'no-restricted-imports')).length).toBeGreaterThanOrEqual(1);
    },
  );

  it.each(['react', 'react/jsx-runtime', '@formrail/core', '@formrail/pro', '@formrail/core/styles.css'])('%s is allowed', async (specifier) => {
    expect(await messages(EXAMPLE, importOf(specifier), 'no-restricted-imports')).toEqual([]);
  });

  it('the rule applies to Pro examples too', async () => {
    expect((await messages('packages/pro/src/x/Some.example.tsx', importOf('zod'), 'no-restricted-imports')).length).toBe(1);
  });

  // #507: react-hook-form (an optional peer of pro) is allowed in the examples of the React Hook Form integration only.
  const RHF_EXAMPLE = 'packages/pro/src/integrations/react-hook-form/Some.example.tsx';
  it.each(['react-hook-form', 'react', '@formrail/pro/engine', '@formrail/pro/react-hook-form'])('%s is allowed in a React Hook Form example', async (specifier) => {
    expect(await messages(RHF_EXAMPLE, importOf(specifier), 'no-restricted-imports')).toEqual([]);
  });

  it.each(['zod', './sibling', '@formrail/core/internal', 'storybook/test', '@tanstack/react-form'])('%s is still rejected in a React Hook Form example', async (specifier) => {
    expect((await messages(RHF_EXAMPLE, importOf(specifier), 'no-restricted-imports')).length).toBeGreaterThanOrEqual(1);
  });

  it('react-hook-form stays rejected in the other examples', async () => {
    expect((await messages(EXAMPLE, importOf('react-hook-form'), 'no-restricted-imports')).length).toBe(1);
    expect((await messages('packages/pro/src/form-rebase/Some.example.tsx', importOf('react-hook-form'), 'no-restricted-imports')).length).toBe(1);
  });
});

const STORY = 'packages/core/src/object-page/Some.stories.tsx';
const story = (body) => `import { exampleStory } from '../internal/example-story';\nexport const Example = { ${body} };\n`;

describe('lint: a story built with exampleStory overrides nothing it renders (#403)', { timeout: 60_000 }, () => {
  it.each([
    ['render after the spread', "tags: ['example'], ...exampleStory('A.example.tsx'), render: () => null"],
    ['render before the spread', "render: () => null, ...exampleStory('A.example.tsx')"],
    ['component after the spread', "...exampleStory('A.example.tsx'), component: Other"],
    ['component before the spread', "component: Other, ...exampleStory('A.example.tsx')"],
    ['decorators after the spread', "...exampleStory('A.example.tsx'), decorators: [(S) => S()]"],
    ['decorators before the spread (it survives the spread)', "decorators: [(S) => S()], ...exampleStory('A.example.tsx')"],
    ['loaders after the spread', "...exampleStory('A.example.tsx'), loaders: [async () => ({})]"],
    ['a quoted key', "...exampleStory('A.example.tsx'), 'render': () => null"],
  ])('%s is an error', async (_name, body) => {
    const found = await messages(STORY, story(body), 'no-restricted-syntax');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/exampleStory/);
  });

  it.each([
    ['tags and the spread', "tags: ['example', '!visual'], ...exampleStory('A.example.tsx')"],
    ['props for the example', "...exampleStory('A.example.tsx', { onBack: () => {} })"],
    ['a story with its own render and no spread', 'render: () => null, component: Other'],
    ['a nested render inside the spread arguments', "...exampleStory('A.example.tsx', { render: () => null })"],
    ['play and args', "...exampleStory('A.example.tsx'), play: async () => {}"],
  ])('%s is allowed', async (_name, body) => {
    expect(await messages(STORY, story(body), 'no-restricted-syntax')).toEqual([]);
  });

  it('the real stories pass', async () => {
    const results = await eslint.lintFiles(['packages/core/src/**/*.stories.tsx', 'packages/pro/src/**/*.stories.tsx']);
    expect(results.flatMap((r) => r.messages.filter((m) => m.ruleId === 'no-restricted-syntax'))).toEqual([]);
  });
});
