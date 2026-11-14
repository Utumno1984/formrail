// Runtime check in the sandbox without @formrail/core (ESM): imports @formrail/pro/engine, renders a React Hook
// Form form whose draft differs from the baseline on the server (react-dom/server) and prints what it got.
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { computeRebase, useChangeSummary } from '@formrail/pro/engine';

const baseline = { number: 'A-1', amount: 10, notes: '' };
const draft = { number: 'A-1', amount: 15, notes: 'call back' };

function Summary() {
  const form = useForm({ defaultValues: draft });
  const { entries } = useChangeSummary({ values: form.watch(), baseline });
  return createElement('ul', null, entries.map((entry) => createElement('li', { key: entry.path }, entry.label)));
}

const rebase = computeRebase({ baseline, values: draft, incoming: { ...baseline, amount: 30, number: 'A-2' } });
console.log(
  JSON.stringify({
    html: renderToString(createElement(Summary)),
    conflicts: rebase.conflicts.map((conflict) => conflict.path),
    values: rebase.values,
  }),
);
