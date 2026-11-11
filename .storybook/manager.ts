import { addons } from 'storybook/manager-api';
import { ropTheme } from './theme';

// Test fixtures stay out of the PUBLIC sidebar (ticket #296). They carry the `internal` tag: whole
// `Internal/*` files at the meta level, the `*NoPlay` copies of a documented story one by one. The
// tag alone does nothing locally (`npm run storybook` shows everything); the public deploy
// (job `deploy-pages`) sets STORYBOOK_HIDE_INTERNAL=1 and the sidebar filters them out. The stories
// stay in the index and keep rendering at `iframe.html?id=...`, because the e2e/visual suites build
// Storybook without the variable and open them by id. `!dev` is NOT used: it would hide them locally too.
// STORYBOOK_* variables are inlined into the manager bundle at build time. Same truthy convention
// as excludePro() in story-globs.mjs, so a new STORYBOOK_* flag behaves consistently either way.
const hideInternalValue = process.env.STORYBOOK_HIDE_INTERNAL;
const hideInternal = hideInternalValue !== undefined && hideInternalValue !== '' && hideInternalValue !== '0' && hideInternalValue !== 'false';

// STORYBOOK_EDITION=pro (Pro demo build) is inlined into the manager the same way.
const proEdition = process.env.STORYBOOK_EDITION === 'pro';

addons.setConfig({
  theme: proEdition ? { ...ropTheme, brandTitle: 'Formrail Pro (preview)' } : ropTheme,
  ...(hideInternal && { sidebar: { filters: { patterns: (item) => !item.tags?.includes('internal') } } }),
});
