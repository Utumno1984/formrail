import {
  createContext,
  createElement,
  forwardRef,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from 'react';
import * as RadixAccordion from '@radix-ui/react-accordion';
import { isDev } from '../internal/is-dev';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';
import {
  DISCLOSURE_CONTENT,
  DISCLOSURE_CONTENT_INNER,
  DISCLOSURE_TRIGGER,
  TriggerBody,
  useDisclosureInert,
  type DisclosureState,
} from './Collapsible';

export type AccordionHeadingLevel = 2 | 3 | 4 | 5 | 6;

interface AccordionBaseProps extends Omit<ComponentPropsWithoutRef<'div'>, 'defaultValue' | 'dir' | 'onChange' | 'value'> {
  /** Blocks every item. */
  disabled?: boolean;
  /** Arrow keys used between triggers. Default `vertical` (up / down). */
  orientation?: 'vertical' | 'horizontal';
  /** Text direction (matters for `orientation="horizontal"`). Default: inherited from the document. */
  dir?: 'ltr' | 'rtl';
  /** Level of the heading that wraps each trigger (2–6). Default `3`. */
  headingLevel?: AccordionHeadingLevel;
}

export interface AccordionSingleProps extends AccordionBaseProps {
  /** At most one item open at a time. */
  type: 'single';
  /**
   * Whether the open item can be closed by clicking it. Default `true`. With `false` one item always
   * stays open once opened: clicking it does nothing and does not call `onValueChange`.
   */
  collapsible?: boolean;
  /**
   * Controlled: the `value` of the open item (`''` for none). Leave it `undefined` for uncontrolled.
   * A value that matches no item leaves every item closed.
   */
  value?: string;
  /** Initial open item when uncontrolled. */
  defaultValue?: string;
  /** Called **only** for a user gesture, never when `value` changes from outside. `''` means "closed". */
  onValueChange?: (value: string) => void;
}

export interface AccordionMultipleProps extends AccordionBaseProps {
  /** Any number of items open at once. */
  type: 'multiple';
  /** Controlled: the `value`s of the open items. Leave it `undefined` for uncontrolled. */
  value?: string[];
  /** Initial open items when uncontrolled. */
  defaultValue?: string[];
  /** Called **only** for a user gesture, never when `value` changes from outside. */
  onValueChange?: (value: string[]) => void;
}

export type AccordionProps = AccordionSingleProps | AccordionMultipleProps;

export interface AccordionItemProps extends Omit<ComponentPropsWithoutRef<'div'>, 'value'> {
  /**
   * Unique inside the accordion; this is what `value` / `onValueChange` carry. In `type="single"`
   * the empty string is reserved for "none open": an item with `value=""` never opens (logs an error
   * in development).
   */
  value: string;
  /** A disabled item cannot be toggled and is skipped by the arrow keys. */
  disabled?: boolean;
}

export type AccordionTriggerProps = Omit<ComponentPropsWithoutRef<'button'>, 'type'>;
export type AccordionContentProps = ComponentPropsWithoutRef<'div'>;

interface AccordionState {
  type: 'single' | 'multiple';
  current: string | string[];
  headingLevel: AccordionHeadingLevel;
}

const AccordionContext = /* @__PURE__ */ createContext<AccordionState>({ type: 'single', current: '', headingLevel: 3 });
const ItemContext = /* @__PURE__ */ createContext<DisclosureState | null>(null);

const ROOT = 'w-full min-w-0 max-w-full font-rop-sans text-rop-body text-rop-text';
// The border belongs to the item; `overflow` is NOT set here (it would clip the trigger's focus ring).
const ITEM = 'min-w-0 border-b border-rop-border-subtle';
const HEADING = 'm-0 min-w-0 text-rop-body font-medium';

const clampLevel = (level: unknown): AccordionHeadingLevel =>
  level === 2 || level === 3 || level === 4 || level === 5 || level === 6 ? level : 3;

/**
 * Accordion: a stack of items, each a heading with a button that opens / closes its panel
 * (`type="single"` or `"multiple"`). Arrow keys (with wrap), Home and End move between the triggers;
 * disabled items are skipped. Closed panels are unmounted and `inert` while they animate out.
 * Controlled or uncontrolled without echo: `onValueChange` is called only for user gestures. Built
 * on Radix Accordion.
 */
export const Accordion = /* @__PURE__ */ forwardRef<HTMLDivElement, AccordionProps>(function Accordion(props, ref) {
  // The union is resolved by `type`; internally the props are handled loosely, then handed to Radix.
  const {
    type,
    value,
    defaultValue,
    onValueChange,
    collapsible = true,
    headingLevel,
    className,
    ...rest
  } = props as Omit<AccordionSingleProps, 'type' | 'value' | 'defaultValue' | 'onValueChange'> & {
    type: 'single' | 'multiple';
    value?: string | string[];
    defaultValue?: string | string[];
    onValueChange?: (value: string | string[]) => void;
  };
  const empty = type === 'multiple' ? [] : '';
  // The uncontrolled state remembers the `type` it belongs to: if `type` changes on the same mounted
  // instance (single <-> multiple), the old shape (string vs array) is dropped for the new empty one.
  const [internal, setInternal] = useState<{ type: string; value: string | string[] }>({
    type,
    value: defaultValue ?? empty,
  });
  const current = value !== undefined ? value : internal.type === type ? internal.value : empty;
  const handleValueChange = (next: string | string[]) => {
    if (value === undefined) setInternal({ type, value: next });
    onValueChange?.(next);
  };
  const state = useMemo(
    () => ({ type, current, headingLevel: clampLevel(headingLevel) }),
    [type, current, headingLevel],
  );
  const common = { ...rest, ref, className: cn(ROOT, className) };
  return (
    <AccordionContext.Provider value={state}>
      {type === 'multiple' ? (
        <RadixAccordion.Root
          {...common}
          type="multiple"
          value={current as string[]}
          onValueChange={handleValueChange}
        />
      ) : (
        <RadixAccordion.Root
          {...common}
          type="single"
          collapsible={collapsible}
          value={current as string}
          onValueChange={handleValueChange}
        />
      )}
    </AccordionContext.Provider>
  );
});

/** One item: a trigger inside a heading, plus its panel. */
export const AccordionItem = /* @__PURE__ */ forwardRef<HTMLDivElement, AccordionItemProps>(function AccordionItem(props, ref) {
  const { className, value, ...rest } = props;
  const { type, current } = useContext(AccordionContext);
  // In `single`, `''` means "none open" (Radix reads it that way): an item can never be open with it.
  const open = Array.isArray(current) ? current.includes(value) : type === 'single' && current !== '' && current === value;
  useEffect(() => {
    if (value === '' && type === 'single' && isDev()) {
      console.error('[react-object-page] <AccordionItem value=""> in a `type="single"` Accordion can never open: `""` means "none open". Use a non-empty value.');
    }
  }, [value, type]);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const state = useMemo(() => ({ open, triggerRef }), [open]);
  return (
    <ItemContext.Provider value={state}>
      <RadixAccordion.Item {...rest} value={value} ref={ref} className={cn(ITEM, className)} />
    </ItemContext.Provider>
  );
});

/** The button of an item (wrapped in a heading, `<h3>` by default). Pass the label as children. */
export const AccordionTrigger = /* @__PURE__ */ forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  function AccordionTrigger(props, ref) {
    const { className, children, ...rest } = props;
    const { headingLevel } = useContext(AccordionContext);
    // Depends on the stable ref object, not on the item context (re-created at every toggle).
    const triggerRef = useContext(ItemContext)?.triggerRef;
    const mergedRef = useMemo(
      () =>
        composeRefs(ref, (node: HTMLButtonElement | null) => {
          if (triggerRef) triggerRef.current = node;
        }),
      [ref, triggerRef],
    );
    return (
      <RadixAccordion.Header asChild>
        {createElement(
          `h${headingLevel}`,
          { className: HEADING },
          <RadixAccordion.Trigger {...rest} ref={mergedRef} className={cn(DISCLOSURE_TRIGGER, className)}>
            <TriggerBody>{children}</TriggerBody>
          </RadixAccordion.Trigger>,
        )}
      </RadixAccordion.Header>
    );
  },
);

/**
 * The panel of an item (`role="region"` labelled by its trigger). Unmounted when closed. Note:
 * `useFocusFirstInvalidField` does not open a closed panel (a field inside it is not in the DOM):
 * open the item yourself before focusing such a field.
 */
export const AccordionContent = /* @__PURE__ */ forwardRef<HTMLDivElement, AccordionContentProps>(
  function AccordionContent(props, ref) {
    const { className, children, ...rest } = props;
    const item = useContext(ItemContext);
    const node = useRef<HTMLDivElement | null>(null);
    const mergedRef = useMemo(() => composeRefs(ref, node), [ref]);
    const fallback = useRef<DisclosureState>({ open: false, triggerRef: { current: null } });
    const shared = item ?? fallback.current;
    useDisclosureInert(shared.open, node, shared);
    return (
      <RadixAccordion.Content {...rest} ref={mergedRef} className={cn(DISCLOSURE_CONTENT, className)}>
        <div className={DISCLOSURE_CONTENT_INNER}>{children}</div>
      </RadixAccordion.Content>
    );
  },
);
