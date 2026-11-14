// #424: a consumer whose data is not shaped like `lineItems` (contacts, each with phone numbers) names its rows
// and reads its reorders through @formrail/pro/engine, without @formrail/core: what the adapters of #507 and #508
// get. Typechecked by `no-core.test.ts` in the sandbox (`skipLibCheck: false`).
import {
  computeChangeSummaryResult,
  type ArrayReorder,
  type ChangeSummaryOptions,
  type ChangeSummaryResult,
  type ItemLabelContext,
} from '@formrail/pro/engine';

export interface Phone {
  kind: string;
  number: string;
}

export interface Contact {
  id: number;
  name: string;
  phones: Phone[];
}

export interface AddressBook {
  contacts: Contact[];
}

/** `Item 2 (Bob)` for a contact, `Item 1 (mobile)` for a phone; `undefined` keeps `Item N`. */
export const contactLabel: NonNullable<ChangeSummaryOptions<AddressBook>['itemLabel']> = (
  arrayPath: string,
  item: unknown,
  { defaultLabel }: ItemLabelContext,
) => {
  if (arrayPath === 'contacts') return `${defaultLabel} (${(item as Contact).name})`;
  if (arrayPath === 'contacts.phones') return `${defaultLabel} (${(item as Phone).kind})`;
  return undefined;
};

export const summarize = (baseline: AddressBook, values: AddressBook): ChangeSummaryResult =>
  computeChangeSummaryResult({
    baseline,
    values,
    arrayIdKeys: { contacts: 'id', 'contacts.phones': 'kind' },
    itemLabel: contactLabel,
  });

/** The save bar rule of an adapter: nothing to save when there is no entry and no reorder. */
export const nothingToSave = ({ entries, reorders }: ChangeSummaryResult): boolean => entries.length === 0 && reorders.length === 0;

export const reorderLabels = (reorders: ArrayReorder[]): string[] => reorders.map((reorder) => reorder.label);
