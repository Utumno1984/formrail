import { Slot } from '@radix-ui/react-slot';
import {
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type LiHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { textOf } from '../internal/react-nodes';
import { TruncatedText } from '../truncated-text/TruncatedText';
import { cn } from '../utils/cn';

export type BreadcrumbSeparator = 'chevron' | 'slash';

const SeparatorContext = /* @__PURE__ */ createContext<BreadcrumbSeparator>('chevron');

export interface BreadcrumbProps extends HTMLAttributes<HTMLElement> {
  /** Decorative separator between items. Default `chevron` (mirrored in RTL). */
  separator?: BreadcrumbSeparator;
}

/**
 * Navigation landmark with an ordered list of `BreadcrumbItem`. The accessible name defaults to
 * "Breadcrumb" (pass your own `aria-label` for another language). The list never wraps: items are truncated with
 * an ellipsis and shrink before the page overflows, the current item last.
 */
export const Breadcrumb = /* @__PURE__ */ forwardRef<HTMLElement, BreadcrumbProps>(function Breadcrumb(
  { separator = 'chevron', className, children, 'aria-label': ariaLabel = 'Breadcrumb', ...rest },
  ref,
) {
  return (
    <SeparatorContext.Provider value={separator}>
      <nav {...rest} ref={ref} aria-label={ariaLabel} className={cn('block min-w-0 max-w-full font-rop-sans text-rop-body', className)}>
        <ol className="m-0 flex min-w-0 list-none flex-nowrap items-center p-0">{children}</ol>
      </nav>
    </SeparatorContext.Provider>
  );
});

// `group/item` + `group-first/item:hidden`: no separator before the first item, whatever the
// consumer renders. Logical properties only (no left/right), so RTL needs no override.
const ITEM =
  'group/item flex min-w-0 max-w-[16rem] shrink-[10] items-center last:max-w-full last:shrink';
// A previous item with real text never shrinks below a readable stub (separator + a few letters),
// so its link keeps a box (focus indicator, hover target). Short or icon-only items stay natural: a
// fixed minimum would inflate them (`min()` cannot take `min-content`).
const MIN_STUB = '[&:not(:last-child)]:min-w-[3rem]';
const STUB_FROM = 6;

/** One entry of the list (`li`). Renders the separator before itself, except when it is the first. */
export const BreadcrumbItem = /* @__PURE__ */ forwardRef<HTMLLIElement, LiHTMLAttributes<HTMLLIElement>>(
  function BreadcrumbItem({ className, children, ...rest }, ref) {
    const separator = useContext(SeparatorContext);
    return (
      <li {...rest} ref={ref} className={cn(ITEM, textOf(children).trim().length >= STUB_FROM && MIN_STUB, className)}>
        <span
          aria-hidden="true"
          data-rop-breadcrumb-separator=""
          className={cn(
            'inline-flex shrink-0 select-none items-center px-1.5 text-rop-text-muted group-first/item:hidden',
            separator === 'chevron' && 'text-[1.25em] leading-none',
          )}
        >
          {/* U+203A is a mirrored character: the browser draws it pointing the other way in RTL, so no direction-dependent CSS is needed (`:dir()` is rewritten by minifiers). */}
          {separator === 'slash' ? '/' : '›'}
        </span>
        {children}
      </li>
    );
  },
);

const LINK =
  'inline-flex min-w-0 max-w-full rounded-rop-sm text-rop-primary no-underline rop-hover:text-rop-primary-hover rop-hover:underline ' +
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2';

export interface BreadcrumbLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /**
   * Render the single child element (e.g. the `Link` of your router) instead of an `<a>`, giving it
   * the classes, `aria-*` and ref. The child must forward its ref and spread unknown props.
   */
  asChild?: boolean;
}

/** Link to an ancestor. The text is truncated inside the link, so the focus indicator is never clipped. */
export const BreadcrumbLink = /* @__PURE__ */ forwardRef<HTMLAnchorElement, BreadcrumbLinkProps>(
  function BreadcrumbLink({ asChild = false, className, children, ...rest }, ref) {
    if (asChild) {
      if (!isValidElement(children)) {
        throw new Error('[react-object-page] <BreadcrumbLink asChild> expects exactly one React element as its child.');
      }
      const child = children as ReactElement<{ className?: string; children?: ReactNode }>;
      // The class merge is done here (Slot only concatenates): the child's own classes go last.
      const merged = cloneElement(
        child,
        { className: cn(LINK, className, child.props.className) },
        <TruncatedText>{child.props.children}</TruncatedText>,
      );
      return (
        <Slot {...rest} ref={ref}>
          {merged}
        </Slot>
      );
    }
    return (
      <a {...rest} ref={ref} className={cn(LINK, className)}>
        <TruncatedText>{children}</TruncatedText>
      </a>
    );
  },
);

/** The current page: non-interactive text with `aria-current="page"`, no `href`, not a tab stop. */
export const BreadcrumbPage = /* @__PURE__ */ forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  function BreadcrumbPage({ className, children, ...rest }, ref) {
    return (
      <TruncatedText {...rest} ref={ref} aria-current="page" className={cn('text-rop-text', className)}>
        {children}
      </TruncatedText>
    );
  },
);
