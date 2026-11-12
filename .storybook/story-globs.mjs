// Story globs and CSS entries of Storybook, computed from the environment.
//
// Three modes:
//   - complete (default: dev, e2e, visual): Free + Pro stories.
//   - Free (STORYBOOK_EXCLUDE_PRO=1, public deploy `/storybook/`): packages/pro left out.
//   - Pro demo (STORYBOOK_EDITION=pro, public deploy `/pro/`): Pro stories + ProIntroduction.mdx only,
//     plus the "Pro preview" banner (preview-pro-demo.ts).
// Reversible: remove the variables from the workflow steps.

const isSet = (value) => value !== undefined && value !== '' && value !== '0' && value !== 'false';

/** True when the environment asks to leave packages/pro out of the build. */
export function excludePro(env = process.env) {
  return isSet(env.STORYBOOK_EXCLUDE_PRO);
}

/** True for the Pro-only demo build (STORYBOOK_EDITION=pro). Contradicts STORYBOOK_EXCLUDE_PRO. */
export function proEdition(env = process.env) {
  const pro = env.STORYBOOK_EDITION === 'pro';
  if (pro && excludePro(env)) {
    throw new Error('STORYBOOK_EDITION=pro and STORYBOOK_EXCLUDE_PRO are mutually exclusive.');
  }
  return pro;
}

/**
 * Extra preview files, relative to `.storybook/`. `preview-pro.ts` imports the SAME CSS entry
 * packages/pro compiles into dist/styles.css; it is left out together with the pro stories.
 * `preview-pro-demo.ts` (banner) is loaded by the Pro demo build only.
 */
export function previewAnnotations(env = process.env) {
  if (proEdition(env)) return ['./preview-pro.ts', './preview-pro-demo.ts'];
  return excludePro(env) ? [] : ['./preview-pro.ts'];
}

/**
 * Pro stories that exist in the repo (and in the complete build, where they are developed) but are not
 * public yet: left out of the Pro demo build ONLY, at the glob level, so they are absent from index.json
 * too (the `internal` tag only hides the sidebar, see manager.ts). Remove an entry when its showcase
 * ticket ships (removing the last one is fine: storyGlobs() then emits the plain glob). Folder names
 * directly under packages/pro/src. Done with an extglob `!(a|b)` because Storybook does not resolve a
 * leading `!` negated glob relative to `.storybook/` (it treats it as a path). An EMPTY extglob `!()`
 * matches NOTHING (not "everything"), which would silently drop every Pro story: hence the empty case below.
 *   - form-rebase: waiting for the showcase integration (#384); leaked in by #395 (incident #421).
 */
export const PRO_DEMO_NOT_PUBLIC = ['form-rebase'];

/** Story globs (and the Pro intro page), relative to `.storybook/`. */
export function storyGlobs(env = process.env, notPublic = PRO_DEMO_NOT_PUBLIC) {
  if (proEdition(env)) {
    const proStories =
      notPublic.length === 0
        ? '../packages/pro/src/**/*.stories.tsx'
        : `../packages/pro/src/!(${notPublic.join('|')})/**/*.stories.tsx`;
    return [proStories, './ProIntroduction.mdx'];
  }
  const globs = ['../packages/core/src/**/*.stories.tsx'];
  if (!excludePro(env)) globs.push('../packages/pro/src/**/*.stories.tsx');
  return globs;
}

/** The introduction page of the Free/complete builds; the Pro demo has its own (in `storyGlobs`). */
export function introductionPages(env = process.env) {
  return proEdition(env) ? [] : ['./Introduction.mdx'];
}

/**
 * The reference pages of `@formrail/core` hooks and types (ticket #402, generated from the TSDoc): Free and
 * complete builds. The Pro demo build gets its own when it documents a Pro hook.
 */
export function referencePages(env = process.env) {
  return proEdition(env) ? [] : ['./reference/*.mdx'];
}
