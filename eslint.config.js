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
    // `packages/core/src/internal.ts` (the facade published at the `@react-object-page/core/internal`
    // subpath) is for @react-object-page/pro only (ticket #230: no semver guarantee, can change in a
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
                'src/internal.ts is the facade published as the Pro-only @react-object-page/core/internal subpath (ticket #230): do not import it from inside the core package itself, nor from a public story/MDX.',
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
