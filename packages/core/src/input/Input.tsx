import { forwardRef, type InputHTMLAttributes } from 'react';
import { useFieldControlProps } from '../field/useFieldControlProps';
import { CONTROL_INVALID, TEXT_CONTROL_BOX } from '../internal/field-control-styles';
import { cn } from '../utils/cn';

export type InputSize = 'sm' | 'md';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Height scale: `sm` 32px, `md` 36px. Default `md` (the native `size` attribute is not exposed). */
  size?: InputSize;
}

// Full literals (Tailwind scan). Height = line height + padding + border, like Button (32px / 36px).
const SIZE_CLASS: Record<InputSize, string> = {
  sm: 'py-[5px]',
  md: 'py-[7px]',
};

/**
 * Text input. Outside a `Field` it is a styled native `<input>`. Inside one it takes `id`,
 * `aria-describedby` (merged with its own), `aria-invalid`, `aria-required`, `disabled`,
 * `readOnly` and `aria-readonly` from the Field, which win over the same props passed here
 * (except `disabled`/`readOnly`, which the Field can only add). Native `readOnly` is what makes
 * a `forced`/`locked` input immune to typing, paste, Backspace, the wheel and the arrow keys.
 * Changing `value` from outside never calls `onChange`.
 */
export const Input = /* @__PURE__ */ forwardRef<HTMLInputElement, InputProps>(function Input(props, ref) {
  const { size = 'md', className, ...rest } = props;
  const fieldProps = useFieldControlProps(rest);
  return (
    <input
      {...rest}
      {...fieldProps}
      ref={ref}
      className={cn(TEXT_CONTROL_BOX, CONTROL_INVALID, SIZE_CLASS[size], className)}
    />
  );
});
