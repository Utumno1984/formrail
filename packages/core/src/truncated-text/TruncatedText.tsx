import {
  forwardRef,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import { textOf } from '../internal/react-nodes';
import { TooltipInternal } from '../tooltip/Tooltip';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';

export interface TruncatedTextProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** The text (or inline content). The full content is always in the DOM. */
  children?: ReactNode;
  /**
   * What the tooltip shows. Default: the plain text of `children` (strings and numbers, depth
   * first); with `children` that carry no text and no `tooltipContent`, there is no tooltip.
   */
  tooltipContent?: ReactNode;
  /** Element to render. */
  as?: 'span' | 'div';
}

// Full literals (Tailwind scan). `block` so the overflow applies to a `span` too; `max-w-full` +
// `min-w-0` are the real width constraint on the element itself (without `min-w-0` a flex item
// would never shrink below its text, and the row would overflow instead of truncating).
const BASE = 'block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap';

/**
 * Single-line text truncated with an ellipsis within the width of its parent, with the full text in
 * a `Tooltip` **only when it really is truncated**. Whether it is truncated is measured at the
 * gesture (the request to open: hover for the tooltip delay, keyboard focus), never at mount and
 * with no permanent `ResizeObserver`, so a container that was resized after the mount is judged by
 * its current width. The open tooltip does not leave an `aria-describedby` on the element (the text
 * is the element's own content; a description would make a screen reader read it twice).
 *
 * Not a tab stop (non-interactive text): pass `tabIndex={0}` to make the tooltip reachable from the
 * keyboard. Touch: a tap opens nothing, as for `Tooltip`.
 */
export const TruncatedText = /* @__PURE__ */ forwardRef<HTMLElement, TruncatedTextProps>(function TruncatedText(
  { children, tooltipContent, as = 'span', className, ...rest },
  ref,
) {
  const Tag = as as 'span';
  const element = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const composedRef = useMemo(() => composeRefs<HTMLElement>(element, ref), [ref]);

  // Asked by the tooltip at the gesture, before it starts opening (a refusal never reaches the
  // shared provider), and while open after every render: text that changes under an open tooltip so
  // that it no longer overflows closes it.
  const isTruncated = () => {
    const node = element.current;
    return !!node && node.scrollWidth > node.clientWidth;
  };

  // `Tooltip` describes its trigger with `aria-describedby` while open; here the trigger's own
  // content is that text. Drop the tooltip's id before paint, keeping any value the consumer set.
  const ownDescribedBy = rest['aria-describedby'];
  useLayoutEffect(() => {
    const node = element.current;
    if (!open || !node) return;
    if (ownDescribedBy) node.setAttribute('aria-describedby', ownDescribedBy);
    else node.removeAttribute('aria-describedby');
  }, [open, ownDescribedBy]);

  const content = tooltipContent !== undefined ? tooltipContent : textOf(children);

  return (
    <TooltipInternal content={content} open={open} onOpenChange={setOpen} canOpen={isTruncated}>
      <Tag {...(rest as HTMLAttributes<HTMLElement>)} ref={composedRef as Ref<HTMLSpanElement>} className={cn(BASE, className)}>
        {children}
      </Tag>
    </TooltipInternal>
  );
});
