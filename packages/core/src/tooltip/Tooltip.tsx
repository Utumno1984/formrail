import {
  createContext,
  useContext,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { isKeyboardNavigating, now, trackKeyboardNavigation } from '../internal/keyboard-navigation';
import { overlayLayer } from '../overlay/layers';
import { cn } from '../utils/cn';

/** Hover delay before a tooltip opens, in ms, unless a provider or a `Tooltip` says otherwise. */
export const TOOLTIP_DEFAULT_DELAY = 500;
/** After a tooltip closes, moving to another trigger within this time opens it with no delay. */
export const TOOLTIP_DEFAULT_SKIP_DELAY = 300;

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';
export type TooltipAlign = 'start' | 'center' | 'end';

// Full literals (Tailwind scan). The maximum width is a real one on the content element; long text
// wraps (`[overflow-wrap:anywhere]`, also for a single long word). Pointer events stay on (the
// tooltip is hoverable, see `Tooltip`) but it can never take the focus: it has no `tabindex`.
// The library ships no box-sizing reset (boxes are content-box): the 19rem maximum plus the 1rem of
// horizontal padding is exactly the 20rem outer width.
const CONTENT =
  'max-w-[19rem] rounded-rop-md bg-rop-text px-2 py-1 font-rop-sans text-rop-label text-rop-surface ' +
  '[overflow-wrap:anywhere] [box-shadow:0_2px_8px_rgb(0_0_0/0.25)]';

// Lets a `Tooltip` know whether it sits inside a `TooltipProvider`, to supply a local one if not.
const ProviderPresent = /* @__PURE__ */ createContext(false);

export interface TooltipProviderProps {
  /** Hover delay in ms before a tooltip opens. Default `500`. */
  delayDuration?: number;
  /** Time in ms after a close during which the next tooltip opens with no delay. Default `300`. */
  skipDelayDuration?: number;
  children?: ReactNode;
}

/**
 * Shared timing for every `Tooltip` below it: one tooltip at a time, and moving between adjacent
 * triggers opens the next one at once. Optional: a `Tooltip` outside any provider creates its own
 * (with the default timings), at the price of losing the "skip the delay" behaviour across triggers.
 */
export function TooltipProvider({
  delayDuration = TOOLTIP_DEFAULT_DELAY,
  skipDelayDuration = TOOLTIP_DEFAULT_SKIP_DELAY,
  children,
}: TooltipProviderProps) {
  return (
    <ProviderPresent.Provider value>
      <RadixTooltip.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration}>
        {children}
      </RadixTooltip.Provider>
    </ProviderPresent.Provider>
  );
}

export interface TooltipProps {
  /**
   * The text. `""` (also whitespace only), `null`, `undefined` and `false` mean "no tooltip": nothing
   * opens and the trigger gets no `aria-describedby`. Plain, non-interactive content only.
   */
  content?: ReactNode;
  /** Preferred side; flips to the opposite one when it would leave the viewport. Default `top`. */
  side?: TooltipSide;
  /** Alignment along that side. Default `center`. */
  align?: TooltipAlign;
  /** Distance from the trigger in px. Default `6`. */
  sideOffset?: number;
  /** Hover delay in ms for this tooltip; defaults to the provider's (`500` without one). */
  delayDuration?: number;
  /**
   * Controlled open state. It is the consumer's responsibility not to open it at mount: the
   * "only on a real gesture" guarantee applies to the uncontrolled tooltip.
   */
  open?: boolean;
  /** Called with the requested state (hover, keyboard focus, Escape, click, scroll). */
  onOpenChange?: (open: boolean) => void;
  /**
   * A trigger with the `disabled` attribute gets no tooltip, because a disabled control receives no
   * pointer or focus events. With this prop it is wrapped in a focusable `span` that does: the
   * span (not the disabled control) is then the trigger and the tab stop. Wrapping happens only
   * while the child is disabled, so toggling `disabled` remounts the child (its internal state is
   * lost), and the span is `inline-flex`, which can change the child's layout (a `w-full` or
   * `flex-1` child no longer fills its parent). The span has no role of its own: the reason is
   * announced as its description, the disabled control inside keeps its name.
   */
  disabledTriggerFocusable?: boolean;
  /**
   * The trigger: exactly one element, which receives the handlers and `ref` (`asChild`). A custom
   * component must spread its props and forward its `ref` onto the DOM element, or the tooltip
   * never opens. `disabled` is read from this element's own props, so put it there. Compose with
   * other `asChild` triggers by wrapping them: `<Tooltip><DialogTrigger asChild><Button/></DialogTrigger></Tooltip>`,
   * not the other way round (`Tooltip` does not forward props or a `ref` to a parent trigger). A
   * missing child (`false`, `null`, e.g. `{allowed && <Button/>}`) renders nothing.
   */
  children: ReactElement | false | null | undefined;
}

function isEmptyContent(content: ReactNode): boolean {
  if (content === null || content === undefined || content === false) return true;
  return typeof content === 'string' && content.trim() === '';
}

/** Not exported from the package: options for the library's own components. */
export interface TooltipInternalProps extends TooltipProps {
  /**
   * Asked on the pointer move / focus that would start an opening, before Radix hears of it. When it
   * returns `false` the gesture is ignored (default prevented): Radix never notifies the shared
   * provider, so a refusal does not switch the other tooltips to "no delay". While open, it is asked
   * again after every render and the tooltip closes through Radix as soon as it returns `false`.
   */
  canOpen?: () => boolean;
}

/**
 * Tooltip (wraps `@radix-ui/react-tooltip`). Opens on **real gestures only**: the pointer resting on
 * the trigger for `delayDuration`, or the focus arriving by keyboard (Tab, Shift+Tab, arrows). A
 * programmatic focus (a Dialog focusing its first button, `autoFocus`) never opens it, and nothing is
 * open at mount. Escape closes only the tooltip (the Dialog around it stays open); a click or tap
 * closes it; scrolling a scrollable ancestor of the trigger closes it. It sits on the `tooltip`
 * level, above popovers and modals, and is hoverable (moving the pointer onto it keeps it open, as
 * WCAG 1.4.13 asks) but never takes focus. Touch: a tap runs the trigger's action and opens nothing.
 *
 * The trigger is described by the tooltip through `aria-describedby`, only while it is open. A
 * `Tooltip` outside a `TooltipProvider` works (it supplies its own provider).
 */
export function Tooltip(props: TooltipProps) {
  return <TooltipInternal {...props} />;
}

export function TooltipInternal({
  canOpen,
  content,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  delayDuration,
  open: openProp,
  onOpenChange,
  disabledTriggerFocusable = false,
  children,
}: TooltipInternalProps) {
  const hasProvider = useContext(ProviderPresent);
  useEffect(() => trackKeyboardNavigation(), []);
  // When this tooltip (and so its trigger) was first rendered: a focus that reaches a trigger mounted
  // after the key went down is the app's (a menu opened by ArrowDown), not the user's.
  const mountedAt = useRef<number | null>(null);
  mountedAt.current ??= now();

  // The open state lives here (never Radix's `defaultOpen`), so a tooltip can only open through
  // `onOpenChange`, i.e. through a gesture, and a blocked one is forced closed.
  const [innerOpen, setInnerOpen] = useState(false);
  const empty = isEmptyContent(content);
  const child = isValidElement<{ disabled?: boolean }>(children) ? children : null;
  const triggerDisabled = !!child?.props.disabled;
  const blocked = empty || (triggerDisabled && !disabledTriggerFocusable);
  // Derived reset: a state left `true` must not reopen the tooltip when it is unblocked.
  if (blocked && innerOpen) setInnerOpen(false);
  const open = blocked ? false : (openProp ?? innerOpen);

  const handleOpenChange = (next: boolean) => {
    if (blocked) return;
    if (openProp === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  };

  // Radix opens on every focus event; the only ones that count are the user's own. A prevented
  // handler is skipped by Radix's composed one, which also keeps a blocked tooltip from touching the
  // provider's shared "a tooltip is open" state (it would skip the delay of the next tooltip).
  const gateFocus = (event: FocusEvent<HTMLElement>) => {
    if (blocked || !isKeyboardNavigating(mountedAt.current ?? 0) || (canOpen && !canOpen())) event.preventDefault();
  };
  const gatePointer = (event: PointerEvent<HTMLElement>) => {
    if (blocked || (canOpen && !canOpen())) event.preventDefault();
  };

  // An open tooltip that may no longer be open (its trigger changed): close it through Radix, so the
  // provider hears the close too (a controlled `open` going `false` by itself would leave it
  // believing a tooltip is still up and the next one would skip its delay). Radix's own trigger
  // closes when the trigger loses the focus (`composeEventHandlers(props.onBlur, context.onClose)`,
  // same DOM node): a `focusout` dispatched on the trigger reaches that composed handler without the
  // focus actually moving. `stopPropagation` in our own `onBlur` - composed *before* Radix's - keeps
  // React from also calling `onBlur` on the trigger's ancestors (a `Field`, a consumer that saves on
  // focus loss),
  // while Radix's own handler on that same node still runs right after (same target, same phase:
  // `stopPropagation` only stops the climb to the next one up, not sibling handlers already queued
  // on this one). The synthetic event never reaches `document`, so it cannot dismiss a Dialog above
  // or reach the app's own `keydown` listeners either.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const forcedCloseRef = useRef(false);
  useEffect(() => {
    if (open && canOpen && !canOpen()) {
      forcedCloseRef.current = true;
      triggerRef.current?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      forcedCloseRef.current = false;
    }
  });
  const handleTriggerBlur = (event: FocusEvent<HTMLElement>) => {
    if (forcedCloseRef.current) event.stopPropagation();
  };

  if (!child) return <>{children}</>;

  const wrapped = triggerDisabled && disabledTriggerFocusable;
  const trigger = wrapped ? (
    // The disabled control would swallow the pointer events: let them reach the span.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the documented opt-in: the span is the tab stop
    <span tabIndex={0} className="inline-flex max-w-full [&>*]:pointer-events-none">
      {children}
    </span>
  ) : (
    children
  );

  const tree = (
    <RadixTooltip.Root open={open} onOpenChange={handleOpenChange} delayDuration={delayDuration}>
      <RadixTooltip.Trigger asChild ref={triggerRef} onFocus={gateFocus} onPointerMove={gatePointer} onBlur={handleTriggerBlur}>
        {trigger}
      </RadixTooltip.Trigger>
      {/* Mounted only while open: a closed tooltip must not cost a Portal and a Presence per trigger, and
          no exit animation needs them after the close. */}
      {open ? (
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            align={align}
            sideOffset={sideOffset}
            collisionPadding={8}
            className={cn(CONTENT, overlayLayer.tooltip)}
          >
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      ) : null}
    </RadixTooltip.Root>
  );

  return hasProvider ? (
    tree
  ) : (
    <TooltipProvider>{tree}</TooltipProvider>
  );
}
