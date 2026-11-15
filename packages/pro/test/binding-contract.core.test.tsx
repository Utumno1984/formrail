// The shared `RebaseFormBinding` suite (binding-contract.ts, ticket #507) against its reference: core's
// `useObjectPageForm`, whose return value is a binding as is.
import { useEffect, useRef } from 'react';
import { useObjectPageForm } from '@formrail/core';
import { CONTRACT_CHECKS, deferred, type ContractForm, type ContractInvoice, type UseContractForm } from './binding-contract';

function useCoreContractForm(initial: ContractInvoice): ContractForm {
  const form = useObjectPageForm<ContractInvoice>({ baseline: initial });
  return {
    binding: form,
    editName: (name) => form.setValue('name', name),
    editCity: (city) => form.setValue('supplier', { ...form.values.supplier, city }),
    // Core validates on save only (schema / validate): no error appears while the user edits.
    showValidationError: () => undefined,
    discard: () => form.reset(),
    startSave: (respond) => {
      const gate = deferred();
      // The documented pattern: the handler returns the stored record (or nothing: the sent values are stored).
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

describe("RebaseFormBinding contract: core's useObjectPageForm (reference)", () => {
  it.each(CONTRACT_CHECKS.map((check) => [check.name, check] as const))('%s', async (_name, check) => {
    await check.run(useCoreContractForm);
  });
});

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Core's form with the save rule before ticket #545, for the whole form: when the user edited anything during a
 * save the server normalized, the values stay the current ones as a whole (the untouched normalized field
 * included) against the stored baseline.
 */
function useWholeFormContractForm(initial: ContractInvoice): ContractForm {
  const contract = useCoreContractForm(initial);
  const form = contract.binding as ReturnType<typeof useObjectPageForm<ContractInvoice>>;
  // The latest committed values, read when the server answers (before the save commits its own result).
  const latest = useRef(initial);
  useEffect(() => {
    latest.current = form.values;
  }, [form.values]);
  return {
    ...contract,
    startSave: (respond) => {
      const gate = deferred();
      let sentValues: ContractInvoice | undefined;
      let stored: ContractInvoice | undefined;
      let atAnswer: ContractInvoice | undefined;
      const done = form.save(async (sent) => {
        sentValues = sent;
        await gate.promise;
        atAnswer = latest.current;
        stored = respond?.(sent);
        return stored;
      });
      return {
        settle: async (error) => {
          if (error === null) gate.resolve();
          else gate.reject(error);
          const ok = await done;
          if (ok && stored !== undefined && atAnswer !== undefined && !same(atAnswer, sentValues) && !same(stored, sentValues)) {
            form.reset(stored);
            form.setValues(atAnswer);
          }
        },
      };
    },
  };
}

describe('the shared contract suite is not blind on core (#545)', () => {
  it('a save decided for the whole form (the rule before #545) fails only the field-by-field check', async () => {
    const failed: string[] = [];
    for (const check of CONTRACT_CHECKS) {
      try {
        await check.run(useWholeFormContractForm as UseContractForm);
      } catch {
        failed.push(check.name);
      }
    }
    expect(failed).toEqual([
      'a field the server normalized and the user did not touch while saving takes the server value (clean); the edit made meanwhile stays',
    ]);
  });
});
