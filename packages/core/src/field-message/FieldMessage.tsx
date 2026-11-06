import { forwardRef, type HTMLAttributes } from 'react';
import { Icon } from '../icon/Icon';
import { CapIconSlot } from '../internal/CapIconSlot';
import { internalIcons } from '../internal/icons';
import { hasContent } from '../internal/react-nodes';
import { cn } from '../utils/cn';

export type FieldMessageTone = 'help' | 'error';

// Full literals (Tailwind scan). Both tones share every geometry class: only the colour differs.
// The icon is 16px, the same as the caption line height; it sits in a `CapIconSlot` (one caption line
// tall, centred on the cap height of the first line), so the row never grows for an error.
const BASE = 'mt-2 flex items-start gap-1 font-rop-sans text-rop-caption [overflow-wrap:anywhere]';
const TONE_CLASS: Record<FieldMessageTone, string> = {
  help: 'text-rop-text-muted',
  error: 'text-rop-error',
};

export interface FieldMessageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  /** Reference it from the control with `aria-describedby`, only while the message exists. */
  id: string;
  /** `help` is muted neutral text; `error` uses the error colour and adds the error icon. Same layout for both. */
  tone: FieldMessageTone;
}

/**
 * Help or error text under a form control; one mechanism so both share spacing and type size.
 * Not a live region: the error is announced through the control's `aria-describedby` +
 * `aria-invalid`. With empty `children` nothing is rendered, so reference its `id` only while the
 * message exists (an `aria-describedby` must not point to a missing node).
 */
export const FieldMessage = /* @__PURE__ */ forwardRef<HTMLDivElement, FieldMessageProps>(function FieldMessage(
  { tone, className, children, ...rest },
  ref,
) {
  if (!hasContent(children)) return null;
  return (
    <div {...rest} ref={ref} className={cn(BASE, TONE_CLASS[tone], className)}>
      {tone === 'error' ? (
        <CapIconSlot>
          <Icon size="sm">{internalIcons.error}</Icon>
        </CapIconSlot>
      ) : null}
      <span className="min-w-0">{children}</span>
    </div>
  );
});
