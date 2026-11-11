import { useContext } from 'react';
import { FieldContext, type FieldControlProps } from './FieldContext';

/** The control props of the enclosing `Field`. Throws outside a `Field`. */
export function useFieldControl(): FieldControlProps {
  const control = useContext(FieldContext);
  if (control === null) {
    throw new Error('[formrail] useFieldControl() must be called inside a <Field>.');
  }
  return control;
}
