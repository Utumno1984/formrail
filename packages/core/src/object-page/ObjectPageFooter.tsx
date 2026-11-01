import {
  forwardRef,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../icon/Icon';
import { internalIcons } from '../internal/icons';
import { hasContent } from '../internal/react-nodes';
import { TruncatedText } from '../truncated-text/TruncatedText';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';
import { isDev } from '../internal/is-dev';
import { useObjectPageContext } from './ObjectPageContext';
import {
  footerActionsClass,
  footerClass,
  footerHiddenClass,
  footerMessageClass,
  footerToneIconClass,
  footerTruncatedClass,
} from './object-page-styles';

export type ObjectPageFooterTone = 'error' | 'success' | 'info';

export type ObjectPageFooterProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /**
   * Shown or hidden. Hidden, the footer still takes its room (the content above never jumps), is
   * not visible, cannot be reached with Tab or clicked (`inert`) and is out of the accessibility tree.
   */
  visible: boolean;
  /** The actions (Save, Cancel...), aligned to the end of the row. The footer creates no buttons of its own. */
  children?: ReactNode;
  /**
   * A general status message (a save error, say), on ONE line at the start of the row: a long text is
   * truncated, with the full text on hover and keyboard focus. Per-field errors do not belong here.
   */
  message?: ReactNode;
  /** Icon and colour of the message. Default `info`. */
  messageTone?: ObjectPageFooterTone;
  /** Visually hidden tone name read before the message. Default: "Errore" / "Operazione riuscita" / "Informazione". */
  toneLabel?: string;
  /** Accessible name of the footer's `region`. Default "Azioni di salvataggio". */
  label?: string;
};

const TONE_LABEL: Record<ObjectPageFooterTone, string> = {
  error: 'Errore',
  success: 'Operazione riuscita',
  info: 'Informazione',
};

// `useLayoutEffect` warns on the server; the footer renders nothing there (its slot does not exist yet).
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The save-bar of an `ObjectPage`. Render it anywhere inside the page: it goes to the slot below
 * the scroller, so it never covers the content. A presentational component: the consumer decides
 * when it is `visible` and what the actions do. It always occupies the same space, so showing or
 * hiding it moves nothing; hidden, it is `inert` and invisible. If the focus is inside it when it
 * hides, the focus moves to the header's title (the page root without a header), never to `<body>`.
 * Only the first mounted footer of a page is rendered.
 *
 * While a save is in flight, mark the action `aria-disabled` rather than `disabled`: the browser drops
 * the focus from a natively disabled button on its own, before the footer can do anything about it.
 * `aria-disabled` does not stop the click: ignore it in the handler while saving.
 *
 * Server rendering: the footer goes to a slot that exists only once the page has mounted, so the server
 * HTML has no footer and no reserved room; it appears (and the scroller shortens by its height) at hydration.
 */
export const ObjectPageFooter = /* @__PURE__ */ forwardRef<HTMLDivElement, ObjectPageFooterProps>(function ObjectPageFooter(
  { visible, children, message, messageTone = 'info', toneLabel, label = 'Azioni di salvataggio', className, ...rest },
  ref,
) {
  const page = useObjectPageContext('ObjectPageFooter');
  const key = useId();
  const barRef = useRef<HTMLDivElement | null>(null);
  const mergedRef = useMemo(() => composeRefs(ref, barRef), [ref]);
  const wasVisible = useRef(visible);
  const claimFooter = page?.claimFooter;
  const focusFallback = page?.focusFallback;
  const claims = page?.footerClaims;
  const slot = page?.footerSlot ?? null;
  const claimed = !!claims?.includes(key);
  const first = claims?.[0] === key;
  const shown = first && !!slot;

  useIsoLayoutEffect(() => claimFooter?.(key), [claimFooter, key]);

  useEffect(() => {
    if (!isDev() || !claimed || first) return;
    console.warn('ObjectPageFooter: a page can have only one footer; this one is not rendered.');
  }, [claimed, first]);

  // Before `inert` goes on (some browsers drop the focus to <body> as soon as it does), the focus is
  // moved out. `inert` is an attribute set by hand: React 18 does not know the property.
  useIsoLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (visible) bar.removeAttribute('inert');
    else {
      if (wasVisible.current && bar.contains(document.activeElement)) focusFallback?.();
      bar.setAttribute('inert', '');
    }
    wasVisible.current = visible;
  }, [visible, shown, focusFallback]);

  // The footer leaves (unmounted, or a footer mounted before it took the slot) with the focus inside.
  useIsoLayoutEffect(() => {
    const bar = barRef.current;
    return () => {
      if (bar && bar.isConnected && bar.contains(document.activeElement)) focusFallback?.();
    };
  }, [shown, focusFallback]);

  if (!shown || !slot) return null;

  const hasMessage = hasContent(message);
  return createPortal(
    <div
      {...rest}
      ref={mergedRef}
      role="region"
      aria-label={label}
      data-object-page-footer=""
      className={cn(footerClass, !visible && footerHiddenClass, className)}
    >
      {/* Always mounted: a live region that is inserted already filled is not announced reliably. */}
      <div role="status" aria-live="polite" data-object-page-footer-message="" className={footerMessageClass}>
        {hasMessage ? (
          <>
            <Icon size="md" className={footerToneIconClass[messageTone]}>
              {internalIcons[messageTone]}
            </Icon>
            <span className="sr-only">{toneLabel ?? TONE_LABEL[messageTone]}: </span>
            <TruncatedText tabIndex={0} className={footerTruncatedClass}>
              {message}
            </TruncatedText>
          </>
        ) : null}
      </div>
      <div data-object-page-footer-actions="" className={footerActionsClass}>
        {children}
      </div>
    </div>,
    slot,
  );
});
