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
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
