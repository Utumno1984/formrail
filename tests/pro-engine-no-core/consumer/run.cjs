// Runtime check in the sandbox without @formrail/core (CommonJS): requires @formrail/pro/engine.
const { computeChangeSummary, useFormRebase } = require('@formrail/pro/engine');

const entries = computeChangeSummary({ baseline: { name: 'Acme' }, values: { name: 'Acme Inc' } });
console.log(JSON.stringify({ paths: entries.map((entry) => entry.path), hook: typeof useFormRebase }));
