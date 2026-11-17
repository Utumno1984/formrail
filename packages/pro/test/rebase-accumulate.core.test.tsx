// The accumulation of the conflicts across server updates (rebase-accumulate-contract.ts, ticket #584) on core's
// `useObjectPageForm`, whose return value is a binding as is.
import { useObjectPageForm } from '@formrail/core';
import { deferred, type ContractForm, type ContractInvoice } from './binding-contract';
import { ACCUMULATE_CHECKS } from './rebase-accumulate-contract';

function useCoreForm(initial: ContractInvoice): ContractForm {
  const form = useObjectPageForm<ContractInvoice>({ baseline: initial });
  return {
    binding: form,
    editName: (name) => form.setValue('name', name),
    editCity: (city) => form.setValue('supplier', { ...form.values.supplier, city }),
    showValidationError: () => undefined,
    discard: () => form.reset(),
    startSave: (respond) => {
      const gate = deferred();
      const done = form.save(async (sent) => {
        await gate.promise;
        return respond?.(sent);
      });
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

describe("useFormRebase with several updates in a row (#584): core's useObjectPageForm", () => {
  it.each(ACCUMULATE_CHECKS.map((check) => [check.name, check] as const))('%s', async (_name, check) => {
    await check.run(useCoreForm);
  });
});
