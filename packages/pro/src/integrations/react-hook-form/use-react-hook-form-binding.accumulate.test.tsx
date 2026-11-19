// `useReactHookFormBinding` + `useFormRebase` with several server updates in a row (ticket #584): the conflicts
// accumulate with the same contract as core's form (the shared suite of test/rebase-accumulate-contract.ts).
import { useForm } from 'react-hook-form';
import { deferred, type ContractForm, type ContractInvoice } from '../../../test/binding-contract';
import { ACCUMULATE_CHECKS } from '../../../test/rebase-accumulate-contract';
import { useReactHookFormBinding } from './use-react-hook-form-binding';

function useRhfForm(initial: ContractInvoice): ContractForm {
  const form = useForm<ContractInvoice>({ defaultValues: initial });
  const binding = useReactHookFormBinding(form);
  return {
    binding,
    editName: (name) => form.setValue('name', name, { shouldDirty: true, shouldTouch: true }),
    editCity: (city) => form.setValue('supplier.city', city, { shouldDirty: true, shouldTouch: true }),
    showValidationError: () => form.setError('name', { type: 'validate', message: 'Invalid name' }),
    discard: () => form.reset(),
    startSave: (respond) => {
      const gate = deferred();
      // The documented pattern: `binding.reset(stored)` inside the handler, before it resolves.
      const done = form
        .handleSubmit(async (sent) => {
          await gate.promise;
          if (respond) binding.reset(respond(sent));
        })()
        .catch(() => undefined);
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

describe('useReactHookFormBinding: several server updates in a row (#584, shared suite)', () => {
  it.each(ACCUMULATE_CHECKS.map((check) => [check.name, check] as const))('%s', async (_name, check) => {
    await check.run(useRhfForm);
  });
});
