// The shared `RebaseFormBinding` suite (binding-contract.ts, ticket #507) against its reference: core's
// `useObjectPageForm`, whose return value is a binding as is.
import { useObjectPageForm } from '@formrail/core';
import { CONTRACT_CHECKS, deferred, type ContractForm, type ContractInvoice } from './binding-contract';

function useCoreContractForm(initial: ContractInvoice): ContractForm {
  const form = useObjectPageForm<ContractInvoice>({ baseline: initial });
  return {
    binding: form,
    editName: (name) => form.setValue('name', name),
    editCity: (city) => form.setValue('supplier', { ...form.values.supplier, city }),
    startSave: () => {
      const gate = deferred();
      const done = form.save(() => gate.promise);
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

describe("RebaseFormBinding contract: core's useObjectPageForm (reference)", () => {
  it.each(CONTRACT_CHECKS.map((check) => [check.name, check] as const))('%s', async (_name, check) => {
    await check.run(useCoreContractForm);
  });
});
