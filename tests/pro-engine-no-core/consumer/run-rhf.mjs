// Runtime check without @formrail/core (ESM, ticket #507): imports @formrail/pro/react-hook-form and the engine,
// renders a React Hook Form form bound to them on the server, and prints what it got.
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { useChangeSummary, useFormRebase } from '@formrail/pro/engine';
import { useReactHookFormBinding } from '@formrail/pro/react-hook-form';

function Editor() {
  const form = useForm({ defaultValues: { supplier: 'Acme', amount: 10 } });
  const binding = useReactHookFormBinding(form);
  const { isEmpty } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
  const { conflicts } = useFormRebase(binding);
  return createElement('p', null, `${binding.values.supplier}|${isEmpty}|${conflicts.length}|${binding.values === binding.baseline}`);
}

console.log(JSON.stringify({ html: renderToString(createElement(Editor)) }));
