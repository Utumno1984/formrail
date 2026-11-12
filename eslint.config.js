import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/storybook-static/**',
      '**/storybook-static-pro/**',
      'site/**',
      '**/playwright-report-site/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '.tickets-draft/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': ['error', { additionalHooks: '^useResizeAndMutationEffect$' }],
    },
  },
  {
    files: ['**/*.{jsx,tsx}'],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // `packages/core/src/internal.ts` (the facade published at the `@formrail/core/internal`
    // subpath) is for @formrail/pro only (ticket #230: no semver guarantee, can change in a
    // patch release). Nothing inside the core package itself — including its own public story/MDX
    // files, which ship in the public Storybook deploy — may import it, by either path.
    files: ['packages/core/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          // A glob `group` (gitignore semantics, via the `ignore` package) would also match every
          // subpath of a matched directory, which "internal" is (the real `src/internal/` of plain
          // implementation details, e.g. `../internal/icons`) — there is no gitignore syntax for
          // "this exact segment, not its children". A regex anchored at the end of the import
          // source has no such ambiguity: it matches only the facade itself.
          patterns: [
            {
              regex: '(^|/)internal$',
              message:
                'src/internal.ts is the facade published as the Pro-only @formrail/core/internal subpath (ticket #230): do not import it from inside the core package itself, nor from a public story/MDX.',
            },
          ],
        },
      ],
    },
  },
  {
    // The Pro story of #377 reuses the Free CRUD showcase from the core SOURCES (`packages/core/src/showcase`,
    // story-only, never in core's `exports`) instead of a copy that would drift. That import is allowed only
    // inside `packages/pro/src/showcase/` (the story and its story-only helpers and tests); everywhere else in
    // packages/pro (the published `src/index.ts` and everything it reaches, the package tests and scripts) any
    // `showcase` import is an error, so neither the Free showcase nor pro's own story-only folder can leak into
    // the package. The e2e specs (`e2e/`) drive the built Storybook and import no sources.
    files: ['packages/pro/**/*.{js,mjs,cjs,ts,tsx}'],
    ignores: ['packages/pro/src/showcase/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)showcase(/|$)',
              message:
                'The invoice showcase (packages/core/src/showcase, packages/pro/src/showcase) is story-only: import it only from packages/pro/src/showcase/ (ticket #377).',
            },
          ],
        },
      ],
    },
  },
  {
    // The copy-paste examples of the Docs pages (ticket #403): their text is what a reader copies ("Show
    // code" prints the file verbatim), so they import only what a consumer can: the public packages by name.
    // Listed after the core rule above so it replaces it for these files (the `internal` facade stays banned).
    files: ['packages/*/src/**/*.example.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^\\.', message: 'A copy-paste example imports only the public packages by name (@formrail/core, @formrail/pro), never a relative path (ticket #403).' },
            { regex: '(^|/)internal(/|$)', message: 'A copy-paste example uses only public API: no `internal` module (ticket #403).' },
            // Allow-list, extendable: `react` and the `@formrail/*` packages (the peers a consumer has installed
            // to paste the example). Anything else (zod, a date library...) is a dependency the reader does not have.
            { regex: '^(?!(react|@formrail/[\\w-]+)(/|$))[^.]', message: 'A copy-paste example imports only `react` and `@formrail/*` packages (the peers of the library); add a package to this list in eslint.config.js only if it is a declared peer dependency (ticket #403).' },
            { regex: '^(storybook|@storybook)(/|$)', message: 'A copy-paste example is plain React code: no Storybook import (fn, args, ...) (ticket #403).' },
          ],
        },
      ],
    },
  },
  {
    // The story of a copy-paste example is `{ tags, ...exampleStory('X.example.tsx') }` and nothing else that
    // changes what is rendered (ticket #403): the spread brings the example's own `render`, and the page prints
    // that file's text. A `render`, `component`, `decorators` or `loaders` in the same object would show
    // something else under the text. Banned BEFORE the spread too: `render` there is dead code (the spread wins)
    // but `component`, `decorators` and `loaders` survive and change what is shown. The e2e audit covers what
    // lint cannot see (a story built elsewhere); see e2e/docs-source.spec.ts. (esquery has no `:has(> x)`: `:has`
    // is a descendant test, so an object that holds an `exampleStory` spread deeper is checked too, which is fine.)
    files: ['packages/*/src/**/*.stories.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...['key.name', 'key.value'].map((key) => ({
          selector: `ObjectExpression:has(SpreadElement > CallExpression[callee.name='exampleStory']) > Property[${key}=/^(render|component|decorators|loaders)$/]`,
          message:
            'A story built with `...exampleStory(...)` renders the example file itself: no `render`, `component`, `decorators` or `loaders` next to the spread, or the page would show something other than the code printed under it (ticket #403).',
        })),
      ],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
