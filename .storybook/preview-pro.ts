// Loaded by Storybook only when packages/pro is part of the build (see story-globs.mjs).
// The SAME entries the packages compile into dist/styles.css (not copies), in the order documented
// for consumers (packages/pro/README.md): core theme + styles, then pro styles. Storybook loads the
// extra preview annotations BEFORE `preview.ts`, so core's entry is imported here first too (the
// module is evaluated once: the later import in `preview.ts` is a no-op). Pro's CSS does not
// depend on this order (see packages/pro/src/styles/index.css), but the docs must reproduce what a
// consumer gets: e2e/pro-css-order.spec.ts asserts the sheets really come in this order.
import '../packages/core/src/styles/index.css';
import '../packages/pro/src/styles/index.css';
