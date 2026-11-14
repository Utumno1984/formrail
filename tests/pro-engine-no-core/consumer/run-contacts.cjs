// #424, runtime check in the sandbox without @formrail/core (CommonJS): the smoke test of the ticket.
const { computeChangeSummaryResult } = require('@formrail/pro/engine');

const result = computeChangeSummaryResult({
  baseline: { c: [{ id: 1, n: 'Ann' }, { id: 2, n: 'Bob' }] },
  values: { c: [{ id: 2, n: 'Bob' }, { id: 1, n: 'Ann' }] },
  arrayIdKeys: { c: 'id' },
  itemLabel: (path, item) => item.n,
});
console.log(JSON.stringify(result));
