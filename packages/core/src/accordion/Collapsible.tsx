import {
  createContext,
  forwardRef,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import * as RadixCollapsible from '@radix-ui/react-collapsible';
import { Icon } from '../icon/Icon';
import { internalIcons } from '../internal/icons';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';

/** What a trigger / content pair shares: whether the panel is open and where its trigger is. */
export interface DisclosureState {
  open: boolean;
  triggerRef: MutableRefObject<HTMLButtonElement | null>;
}

export const DisclosureContext = /* @__PURE__ */ createContext<DisclosureState | null>(null);

// Full literals (Tailwind scan). The chevron sits in a fixed-size box and only rotates, so opening
// a panel changes the height of the panel itself and nothing else (no width or trigger-height change).
export const DISCLOSURE_TRIGGER =
  'group flex w-full min-w-0 cursor-pointer items-center justify-between gap-3 border-0 bg-transparent ' +
  'px-3 py-3 text-start font-rop-sans text-rop-body font-medium text-rop-text ' +
  'not-disabled:rop-hover:bg-rop-surface-subtle ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  // Drawn inside the box: never clipped by an ancestor with `overflow: hidden`.
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:-outline-offset-2';
export const DISCLOSURE_LABEL = 'min-w-0 break-words';
const CHEVRON =
  'shrink-0 text-rop-text-muted group-data-[state=open]:rotate-180 ' +
  'motion-safe:[transition-property:rotate] motion-safe:duration-[var(--motion-rop-disclosure-duration)] ' +
  'motion-safe:ease-[var(--motion-rop-disclosure-easing)]';
// `overflow: hidden` is only in the keyframes (it clips while the height animates, never at rest).
export const DISCLOSURE_CONTENT =
  'min-w-0 font-rop-sans text-rop-body text-rop-text ' +
  'motion-safe:data-[state=open]:animate-rop-disclosure-down motion-safe:data-[state=closed]:animate-rop-disclosure-up';
export const DISCLOSURE_CONTENT_INNER = 'min-w-0 px-3 pt-3 pb-3';

/** Disclosure chevron: the system's own chevron icon (as Select and the sortable headers use), decorative. */
export function Chevron() {
  return <Icon size="sm" className={CHEVRON}>{internalIcons['chevron-down']}</Icon>;
}

/** Trigger label + chevron, shared by `CollapsibleTrigger` and `AccordionTrigger`. */
export function TriggerBody({ children }: { children?: ReactNode }) {
  return (
    <>
      <span className={DISCLOSURE_LABEL}>{children}</span>
      <Chevron />
    </>
  );
}

/**
 * Closed content must be unreachable: Radix unmounts it once its exit animation is over, and during
 * that animation it is `inert`. When an open panel that holds the focus is closed from outside, the
 * focus moves to the panel's trigger instead of falling on `<body>`.
 *
 * One layout effect does both, in this order: (1) if the focus is inside, move it to the trigger,
 * (2) only then set `inert`. `inert` is set by hand (not as a React prop) precisely so that it is
 * applied after the rescue: a browser that drops the focus to `<body>` as soon as an ancestor turns
 * inert (or, with the prop, in the same commit) can no longer take the focus away before we read it.
 * It also needs no React-version handling (React 18 and 19 treat the `inert` prop differently).
 */
export function useDisclosureInert(open: boolean, contentRef: MutableRefObject<HTMLElement | null>, state: DisclosureState) {
  const wasOpen = useRef(open);
  useLayoutEffect(() => {
    const node = contentRef.current;
    if (wasOpen.current && !open && node) {
      const active = typeof document === 'undefined' ? null : document.activeElement;
      if (active && node !== active && node.contains(active)) state.triggerRef.current?.focus();
    }
    wasOpen.current = open;
    if (!node) return;
    if (open) node.removeAttribute('inert');
    else node.setAttribute('inert', '');
  }, [open, contentRef, state.triggerRef]);
}

export interface CollapsibleProps extends Omit<ComponentPropsWithoutRef<'div'>, 'defaultValue' | 'onChange'> {
  /**
   * Controlled state. Omit the prop (leave it `undefined`) to leave the collapsible uncontrolled.
   * Changing it from outside opens / closes the panel without calling `onOpenChange`.
   */
  open?: boolean;
  /** Initial state when uncontrolled. Default `false`. */
  defaultOpen?: boolean;
  /** Called with the new state **only** for a user gesture (click, Enter, Space). */
  onOpenChange?: (open: boolean) => void;
  /** Blocks click and keyboard on the trigger. */
  disabled?: boolean;
}

export type CollapsibleTriggerProps = Omit<ComponentPropsWithoutRef<'button'>, 'type'>;
export type CollapsibleContentProps = ComponentPropsWithoutRef<'div'>;

/**
 * Collapsible: one button that shows / hides a panel (disclosure pattern). The trigger carries
 * `aria-expanded` / `aria-controls`; closed content is unmounted (after its exit animation), so it
 * is out of the tab order and of the accessibility tree. The height animation is a token-driven CSS
 * keyframe, switched off with `prefers-reduced-motion`. Built on Radix Collapsible.
 */
export const Collapsible = /* @__PURE__ */ forwardRef<HTMLDivElement, CollapsibleProps>(function Collapsible(props, ref) {
  const { open, defaultOpen = false, onOpenChange, className, ...rest } = props;
  const [internal, setInternal] = useState(defaultOpen);
  const current = open !== undefined ? open : internal;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const state = useMemo(() => ({ open: current, triggerRef }), [current]);
  // Radix only calls this for user gestures: that is what keeps `onOpenChange` echo-free.
  const handleOpenChange = (next: boolean) => {
    if (open === undefined) setInternal(next);
    onOpenChange?.(next);
  };
  return (
    <DisclosureContext.Provider value={state}>
      <RadixCollapsible.Root {...rest} ref={ref} open={current} onOpenChange={handleOpenChange} className={cn('min-w-0', className)} />
    </DisclosureContext.Provider>
  );
});

/** The button that toggles the panel. Pass the label as children. */
export const CollapsibleTrigger = /* @__PURE__ */ forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
  function CollapsibleTrigger(props, ref) {
    const { className, children, ...rest } = props;
    // Depends on the stable ref object, not on the context value (re-created at every toggle): the
    // trigger's ref must not be detached and re-attached each time the panel opens or closes.
    const triggerRef = useContext(DisclosureContext)?.triggerRef;
    const mergedRef = useMemo(
      () =>
        composeRefs(ref, (node: HTMLButtonElement | null) => {
          if (triggerRef) triggerRef.current = node;
        }),
      [ref, triggerRef],
    );
    return (
      <RadixCollapsible.Trigger {...rest} ref={mergedRef} className={cn(DISCLOSURE_TRIGGER, className)}>
        <TriggerBody>{children}</TriggerBody>
      </RadixCollapsible.Trigger>
    );
  },
);

/**
 * The panel. Unmounted when closed. Note: `useFocusFirstInvalidField` does not open a closed panel
 * (a field inside it is not in the DOM): open the panel yourself before focusing such a field.
 */
export const CollapsibleContent = /* @__PURE__ */ forwardRef<HTMLDivElement, CollapsibleContentProps>(
  function CollapsibleContent(props, ref) {
    const { className, children, ...rest } = props;
    const state = useContext(DisclosureContext);
    const node = useRef<HTMLDivElement | null>(null);
    const mergedRef = useMemo(() => composeRefs(ref, node), [ref]);
    const fallback = useRef<DisclosureState>({ open: false, triggerRef: { current: null } });
    const shared = state ?? fallback.current;
    useDisclosureInert(shared.open, node, shared);
    return (
      <RadixCollapsible.Content {...rest} ref={mergedRef} className={cn(DISCLOSURE_CONTENT, className)}>
        <div className={DISCLOSURE_CONTENT_INNER}>{children}</div>
      </RadixCollapsible.Content>
    );
  },
);
