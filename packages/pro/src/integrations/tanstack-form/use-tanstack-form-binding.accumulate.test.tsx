// `useTanStackFormBinding` + `useFormRebase` with several server updates in a row (ticket #584): the conflicts
// accumulate with the same contract as core's form (the shared suite of test/rebase-accumulate-contract.ts).
import { useEffect, useRef, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import type { RebaseFormBinding } from '../../engine';
import { deferred, type ContractForm, type ContractInvoice } from '../../../test/binding-contract';
import { ACCUMULATE_CHECKS } from '../../../test/rebase-accumulate-contract';
import { useTanStackFormBinding } from './use-tanstack-form-binding';

/**
 * The form in the pattern the binding's docs recommend: the `defaultValues` of `useForm` kept on the binding's baseline,
 * so TanStack Form's own `form.reset()` is a discard to the record the form was rebased on.
 */
function useTanStackForm(initial: ContractInvoice): ContractForm {
  const [saved, setSaved] = useState(initial);
  const save = useRef<{ gate: Promise<void>; respond?: (sent: ContractInvoice) => ContractInvoice } | null>(null);
  const bindingRef = useRef<RebaseFormBinding<ContractInvoice> | null>(null);
  const form = useForm({
    defaultValues: saved,
    onSubmit: async ({ value }) => {
      const current = save.current!;
      await current.gate;
      // The documented pattern: `binding.reset(stored)` inside `onSubmit`, before it resolves.
      if (current.respond) bindingRef.current!.reset(current.respond(value));
    },
  });
  const binding = useTanStackFormBinding(form);
  bindingRef.current = binding;
  useEffect(() => setSaved(binding.baseline), [binding.baseline]);
  return {
    binding,
    editName: (name) => form.setFieldValue('name', name),
    editCity: (city) => form.setFieldValue('supplier.city', city),
    showValidationError: () => form.setFieldMeta('name', (meta) => ({ ...meta, errorMap: { ...meta.errorMap, onChange: 'Invalid name' } })),
    discard: () => form.reset(),
    startSave: (respond) => {
      const gate = deferred();
      save.current = { gate: gate.promise, respond };
      const done = form.handleSubmit().catch(() => undefined);
      return {
        settle: async (error) => {
          if (error === null) gate.resolve();
          else gate.reject(error);
          await done;
        },
      };
    },
  };
}

describe('useTanStackFormBinding: several server updates in a row (#584, shared suite)', () => {
  it.each(ACCUMULATE_CHECKS.map((check) => [check.name, check] as const))('%s', async (_name, check) => {
    await check.run(useTanStackForm);
  });
});
