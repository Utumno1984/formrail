// Runtime check without @formrail/core and without react-hook-form (ESM, ticket #508): imports
// @formrail/pro/tanstack-form and the engine, renders a TanStack Form form bound to them on the server, and prints
// what it got.
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useForm } from '@tanstack/react-form';
import { useChangeSummary, useFormRebase } from '@formrail/pro/engine';
import { useTanStackFormBinding } from '@formrail/pro/tanstack-form';

function Editor() {
  const form = useForm({ defaultValues: { supplier: 'Lumen Parts', amount: 10 } });
  const binding = useTanStackFormBinding(form);
  const { isEmpty } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
  const { conflicts } = useFormRebase(binding);
  return createElement('p', null, `${binding.values.supplier}|${isEmpty}|${conflicts.length}|${binding.values === binding.baseline}`);
}

console.log(JSON.stringify({ html: renderToString(createElement(Editor)) }));
