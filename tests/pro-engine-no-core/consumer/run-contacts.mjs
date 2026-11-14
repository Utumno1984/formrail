// #424, runtime check in the sandbox without @formrail/core (ESM): row labels and reorders of a `contacts` array.
import { computeChangeSummaryResult } from '@formrail/pro/engine';

const ann = { id: 1, name: 'Ann', phones: [{ kind: 'home', number: '1' }, { kind: 'mobile', number: '2' }] };
const bob = { id: 2, name: 'Bob', phones: [] };
const result = computeChangeSummaryResult({
  baseline: { contacts: [ann, bob] },
  values: { contacts: [bob, { ...ann, phones: [{ kind: 'mobile', number: '3' }, { kind: 'home', number: '1' }] }] },
  arrayIdKeys: { contacts: 'id', 'contacts.phones': 'kind' },
  itemLabel: (arrayPath, item) => (arrayPath === 'contacts' ? item.name : item.kind),
});
console.log(JSON.stringify({ entries: result.entries.map((entry) => entry.label), reorders: result.reorders.map((reorder) => reorder.label) }));
