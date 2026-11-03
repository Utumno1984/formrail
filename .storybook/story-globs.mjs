// Story globs and CSS entries of Storybook, computed from the environment.
//
// The public deploy (job `deploy-pages`) sets STORYBOOK_EXCLUDE_PRO=1 and publishes the Free
// stories only; every other build (dev, e2e, visual) includes packages/pro. Reversible: remove the
// variable from the workflow step.

/** True when the environment asks to leave packages/pro out of the build. */
export function excludePro(env = process.env) {
  const value = env.STORYBOOK_EXCLUDE_PRO;
  return value !== undefined && value !== '' && value !== '0' && value !== 'false';
}

/**
 * Extra preview files, relative to `.storybook/`. `preview-pro.ts` imports the SAME CSS entry
 * packages/pro compiles into dist/styles.css; it is left out together with the pro stories.
 */
export function previewAnnotations(env = process.env) {
  return excludePro(env) ? [] : ['./preview-pro.ts'];
}

/** Story globs, relative to `.storybook/`. */
export function storyGlobs(env = process.env) {
  const globs = ['../packages/core/src/**/*.stories.tsx'];
  if (!excludePro(env)) globs.push('../packages/pro/src/**/*.stories.tsx');
  return globs;
}
