import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { Button } from '../button/Button';
import { Icon } from '../icon/Icon';
import { CapIconSlot } from '../internal/CapIconSlot';
import { internalIcons } from '../internal/icons';
import { hasContent, textOf } from '../internal/react-nodes';
import { cn } from '../utils/cn';

export type MessageStripTone = 'info' | 'success' | 'warning' | 'error';

// Full literals (Tailwind scan). Background = the tone colour at 10% opacity.
const TONE_CLASS: Record<MessageStripTone, { box: string; icon: string }> = {
  info: { box: 'border-rop-info bg-rop-info/10', icon: 'text-rop-info' },
  success: { box: 'border-rop-success bg-rop-success/10', icon: 'text-rop-success' },
  warning: { box: 'border-rop-warning bg-rop-warning/10', icon: 'text-rop-warning' },
  error: { box: 'border-rop-error bg-rop-error/10', icon: 'text-rop-error' },
};

const TONE_LABEL: Record<MessageStripTone, string> = {
  info: 'Information',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
};

const DEFAULT_DISMISS_LABEL = 'Dismiss message';

export interface MessageStripProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'role'> {
  /** Default `info`. */
  tone?: MessageStripTone;
  /** Bold text before the content, in the same block. */
  title?: ReactNode;
  /**
   * Shows a close button that calls this. The strip never hides itself: the consumer unmounts it
   * (and decides where the focus goes afterwards).
   */
  onDismiss?: () => void;
  /**
   * Accessible name of the close button. Default: "Dismiss message: <title>", so strips with
   * different titles get different names ("Dismiss message" alone when there is no title text).
   * The text is read from the `title` node itself: a title produced by a component that renders
   * its text on its own (e.g. a translation component) has none, so pass `dismissLabel` then.
   */
  dismissLabel?: string;
  /** Visually hidden tone name read before the content (colour alone is not enough). Default: English tone name. */
  toneLabel?: string;
  /**
   * Live region: `alert` for `error`, `status` for the other tones. `false` removes the role, for
   * strips already on the page at load that must not be announced. Default `true`. Changing `tone`
   * after mount updates the role, but some screen readers only announce a live region when it is
   * inserted (the same goes for a strip that is mounted already filled): mount a new strip to be
   * sure an error is announced.
   */
  live?: boolean;
}

/**
 * Inline status banner. Renders the tone icon (decorative), a hidden tone name, an optional bold
 * `title` and the `children`; with `onDismiss` also a close `Button`.
 */
export const MessageStrip = /* @__PURE__ */ forwardRef<HTMLDivElement, MessageStripProps>(function MessageStrip(
  { tone = 'info', title, onDismiss, dismissLabel, toneLabel, live = true, className, children, ...rest },
  ref,
) {
  const titleText = textOf(title).trim();
  const closeName = dismissLabel ?? (titleText ? `${DEFAULT_DISMISS_LABEL}: ${titleText}` : DEFAULT_DISMISS_LABEL);
  const role = live ? (tone === 'error' ? 'alert' : 'status') : undefined;
  const classes = TONE_CLASS[tone];

  return (
    <div
      {...rest}
      ref={ref}
      role={role}
      className={cn(
        'flex items-start gap-2 rounded-rop-md border p-3 font-rop-sans text-rop-body text-rop-text [overflow-wrap:anywhere]',
        classes.box,
        className,
      )}
    >
      {/* One text line tall, centred on the cap height of the first line (title or content). */}
      <CapIconSlot>
        <Icon size="md" className={classes.icon}>
          {internalIcons[tone]}
        </Icon>
      </CapIconSlot>
      <div className="min-w-0 flex-1">
        <span className="sr-only">{toneLabel ?? TONE_LABEL[tone]}: </span>
        {hasContent(title) ? <strong className="block font-[700]">{title}</strong> : null}
        {hasContent(children) ? <div>{children}</div> : null}
      </div>
      {onDismiss ? (
        <Button size="icon-xs" variant="ghost" aria-label={closeName} onClick={onDismiss} className="-my-0.5 -mr-1">
          {internalIcons.close}
        </Button>
      ) : null}
    </div>
  );
});
