import { useContext, type AriaAttributes } from 'react';
import { FieldContext } from './FieldContext';

/** The attributes a form control takes from its `Field`, already resolved against its own props. */
export interface ResolvedFieldControlProps {
  id: string | undefined;
  'aria-labelledby': string | undefined;
  'aria-describedby': string | undefined;
  'aria-invalid': AriaAttributes['aria-invalid'];
  'aria-required': AriaAttributes['aria-required'];
  'aria-readonly': AriaAttributes['aria-readonly'];
  disabled: boolean | undefined;
  readOnly: boolean | undefined;
  name: string | undefined;
  'data-rop-name': string | undefined;
}

interface OwnProps {
  id?: string | undefined;
  'aria-labelledby'?: string | undefined;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: AriaAttributes['aria-invalid'];
  'aria-required'?: AriaAttributes['aria-required'];
  'aria-readonly'?: AriaAttributes['aria-readonly'];
  disabled?: boolean | undefined;
  readOnly?: boolean | undefined;
  name?: string | undefined;
  'data-rop-name'?: string | undefined;
}

/**
 * Internal (not exported from the package): the single place where `Input`, `Select` and
 * `Combobox` combine what the enclosing `Field` provides with their own props. The Field wins
 * for `id`, `aria-labelledby`, `aria-invalid`, `aria-required`, `aria-readonly`, `disabled` and
 * `readOnly` (the last two it can only add: absent in the Field, the consumer's value stays), and
 * `aria-describedby` is merged: the Field's ids first, then the consumer's. `name` is the consumer's, else the Field's (`Select` never reads it: it
 * emits no native `name`); `data-rop-name` is the Field's. Outside a `Field` the
 * consumer's props come back as they are. Every key is always present in the result (possibly
 * `undefined`), exactly like the explicit attributes the controls set before this hook existed.
 */
export function useFieldControlProps(own: OwnProps): ResolvedFieldControlProps {
  const control = useContext(FieldContext);
  return {
    id: control?.id ?? own.id,
    'aria-labelledby': control?.['aria-labelledby'] ?? own['aria-labelledby'],
    'aria-describedby': [control?.['aria-describedby'], own['aria-describedby']].filter(Boolean).join(' ') || undefined,
    'aria-invalid': control?.['aria-invalid'] ?? own['aria-invalid'],
    'aria-required': control?.['aria-required'] ?? own['aria-required'],
    'aria-readonly': control?.['aria-readonly'] ?? own['aria-readonly'],
    disabled: control?.disabled ?? own.disabled,
    readOnly: control?.readOnly ?? own.readOnly,
    // The consumer's own native `name` wins; the Field's name is the fallback.
    name: own.name ?? control?.['data-rop-name'],
    'data-rop-name': control?.['data-rop-name'] ?? own['data-rop-name'],
  };
}
