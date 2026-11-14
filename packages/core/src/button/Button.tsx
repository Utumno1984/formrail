import {
  cloneElement,
  forwardRef,
  Fragment,
  isValidElement,
  useEffect,
  version,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type SVGProps,
} from 'react';
import { Slot, Slottable } from '@radix-ui/react-slot';
import { Icon, type IconSize } from '../icon/Icon';
import { cn } from '../utils/cn';
import { OPTICAL_LABEL_TYPOGRAPHY, OpticalLabel } from '../utils/OpticalLabel';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonTextSize = 'sm' | 'md' | 'lg' | 'inline';
export type ButtonIconSize = 'icon-xs' | 'icon-sm' | 'icon-md';
export type ButtonSize = ButtonTextSize | ButtonIconSize;

// Full literals (Tailwind scan, which also reads comments: do not write the bare names of the
// shadow-like utilities here). The keyboard focus indicator is an arbitrary declaration, not one of
// those utilities, because they make Tailwind v4 emit many global `--tw-*` defaults in its
// un-namespaced layer (see the README). `:focus-visible`: keyboard only, never on click.
const BASE =
  'inline-flex max-w-full shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 ' +
  'rounded-rop-md border border-transparent text-center no-underline font-rop-sans font-[500] [overflow-wrap:anywhere] ' +
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  // Hover/active only on an enabled control; primary/danger darken (keeps the white text AA).
  primary:
    'bg-rop-primary text-rop-primary-contrast not-disabled:not-aria-disabled:rop-hover:bg-rop-primary-hover not-disabled:not-aria-disabled:active:bg-rop-primary-active',
  secondary:
    'border-rop-border bg-rop-surface text-rop-text not-disabled:not-aria-disabled:rop-hover:bg-rop-surface-subtle not-disabled:not-aria-disabled:active:bg-rop-surface-pressed',
  ghost:
    'bg-transparent text-rop-primary not-disabled:not-aria-disabled:rop-hover:bg-rop-surface-subtle not-disabled:not-aria-disabled:active:bg-rop-surface-pressed not-disabled:not-aria-disabled:active:text-rop-primary-active',
  danger:
    'bg-rop-error text-rop-primary-contrast not-disabled:not-aria-disabled:rop-hover:bg-rop-error-hover not-disabled:not-aria-disabled:active:bg-rop-error-active',
};

// Text sizes get their height from line height + vertical padding (+ 2px border), so they grow when
// the label wraps and a consumer `h-*` is a plain override; the icon-only ones are fixed squares.
// `inline` takes font and line height from the surrounding text and is exactly one line tall
// (`1lh`), so a button inside a paragraph never widens the line.
const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-[5px]', // 32px
  md: 'px-3.5 py-[7px]', // 36px
  lg: 'px-4 py-[11px]', // 44px
  // `justify-start` overrides BASE's `justify-center`: centered content whose width is clamped by
  // `max-w-full` while `whitespace-nowrap` keeps it from wrapping would otherwise overflow
  // symmetrically on both sides, pushing roughly half the label off-screen to the left (invisible,
  // not just "overflowing" as documented below).
  // `underline`: inline sits inside running text, where `text-rop-primary` on `text-rop-text` only
  // measures ~2.8:1 (WCAG 1.4.1/technique G183 wants 3:1 to rely on color alone) — permanent, not
  // `rop-hover:`, since the indicator must be visible without interacting. SVG icons ignore
  // text-decoration, so a leading/trailing icon is unaffected.
  inline:
    'h-[1lh] whitespace-nowrap justify-start px-1 align-baseline text-[length:inherit] leading-[inherit] underline underline-offset-2',
  'icon-xs': 'size-6 p-0',
  'icon-sm': 'size-8 p-0',
  'icon-md': 'size-9 p-0',
};

// Label typography. A plain-text label (wrapped in `OpticalLabel`) uses `line-height: 1`; the 20px line
// box the sizes above are tuned for is restored by the wrapper's `min-h-5`, so heights do not change.
// Anything else (asChild, element children, mixed content) keeps the `text-rop-label` size + line height.
const TEXT_SIZES = new Set<ButtonSize>(['sm', 'md', 'lg']);
const LABEL_PLAIN = 'text-rop-label';
const LABEL_WRAPPED = OPTICAL_LABEL_TYPOGRAPHY;

const isPlainText = (node: ReactNode): boolean =>
  typeof node === 'string' ||
  typeof node === 'number' ||
  (Array.isArray(node) && node.length > 0 && node.every((n) => typeof n === 'string' || typeof n === 'number'));

const ICON_SIZE: Record<ButtonSize, IconSize> = {
  inline: 'xs',
  sm: 'sm',
  md: 'sm',
  lg: 'md',
  'icon-xs': 'sm',
  'icon-sm': 'md',
  'icon-md': 'lg',
};

type IconElement = ReactElement<SVGProps<SVGSVGElement>>;

// `aria-label` / `aria-labelledby` are left out here and declared by every size branch below, with
// the same TSDoc: an HTML declaration would add its generic text to theirs in the props table.
interface ButtonBaseProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label' | 'aria-labelledby'> {
  /**
   * Visual emphasis.
   * @default 'secondary'
   */
  variant?: ButtonVariant;
  /**
   * Renders the single child element (e.g. an `<a href>`) instead of a `<button>`, merging classes,
   * props, `onClick` and `ref` into it (the child's own `className` wins over the Button's). `type`
   * is not defaulted in this mode (an explicit one is passed on); `disabled` becomes
   * `aria-disabled="true"` + `tabIndex=-1` + a blocked click, since only `<button>` has a native one.
   * The `href` of a disabled link stays, so middle-click / "open in new tab" still navigate.
   * @default false
   */
  asChild?: boolean;
  /** An `<svg>` shown before the label, sized by `size`. Decorative: never part of the name. */
  leadingIcon?: IconElement;
  /** An `<svg>` shown after the label, sized by `size`. Decorative: never part of the name. */
  trailingIcon?: IconElement;
  /** The label. Plain text, or any content with `asChild`. Omit it for the icon-only sizes. */
  children?: ReactNode;
}

type AccessibleName =
  | {
      /** Accessible name. Required with the `icon-*` sizes (this or `aria-labelledby`): they have no visible text. */
      'aria-label': string;
      /** Id of the element that names the button. Required with the `icon-*` sizes (this or `aria-label`). */
      'aria-labelledby'?: string;
    }
  | {
      /** Id of the element that names the button. Required with the `icon-*` sizes (this or `aria-label`). */
      'aria-labelledby': string;
      /** Accessible name. Required with the `icon-*` sizes (this or `aria-labelledby`): they have no visible text. */
      'aria-label'?: string;
    };

/**
 * Text sizes need nothing extra. The `icon-*` sizes have no visible text, so TypeScript requires an
 * accessible name (`aria-label` or `aria-labelledby`); a missing/blank one is also reported with
 * `console.error` in development.
 */
export type ButtonProps = ButtonBaseProps &
  (
    | {
        /**
         * Height scale (`sm` 32px, `md` 36px, `lg` 44px) or `inline` (one text line, for use inside a
         * paragraph): the text sizes. The square icon-only sizes (`icon-xs` 24px, `icon-sm`
         * 32px, `icon-md` 36px) are never implied: pass one explicitly, together with `aria-label` or
         * `aria-labelledby` (there is no visible text).
         * @default 'md'
         */
        size?: ButtonTextSize;
        /** Accessible name. Required with the `icon-*` sizes (this or `aria-labelledby`): they have no visible text. */
        'aria-label'?: string | undefined;
        /** Id of the element that names the button. Required with the `icon-*` sizes (this or `aria-label`). */
        'aria-labelledby'?: string | undefined;
      }
    | ({
        /**
         * Height scale (`sm` 32px, `md` 36px, `lg` 44px) or `inline` (one text line, for use inside a
         * paragraph): the text sizes. The square icon-only sizes (`icon-xs` 24px, `icon-sm`
         * 32px, `icon-md` 36px) are never implied: pass one explicitly, together with `aria-label` or
         * `aria-labelledby` (there is no visible text).
         */
        size: ButtonIconSize;
      } & AccessibleName)
  );

// Bundlers replace `process.env.NODE_ENV` in consumer builds; without `process` assume development.
// (`typeof process` is NOT replaced by bundlers, so it would keep the dev code in production.)
const isDev = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
};
const isBlank = (value: unknown): boolean => typeof value !== 'string' || value.trim() === '';

const blockClick = (event: MouseEvent) => event.preventDefault();

/**
 * Button primitive. Renders `<button type="button">` (never an implicit `submit`), or, with
 * `asChild`, the child element carrying the same classes. The consumer `className` is merged last
 * and wins over the defaults. `ref` points to the rendered node (the child's node with `asChild`).
 *
 * `size="inline"` never wraps its label (`whitespace-nowrap`, so it stays one line tall inside a
 * paragraph). Accepted trade-off: in a container narrower than the label the button stays capped
 * at the container width and the text overflows it horizontally instead of wrapping; keep inline
 * labels short or clip/scroll the container.
 */
export const Button = /* @__PURE__ */ forwardRef<HTMLElement, ButtonProps>(function Button(props, ref) {
  const {
    variant = 'secondary',
    size = 'md',
    asChild = false,
    leadingIcon,
    trailingIcon,
    className,
    disabled,
    type,
    onClick,
    children,
    ...rest
  } = props;

  const iconOnly = size.startsWith('icon-');
  const named = !isBlank(rest['aria-label']) || !isBlank(rest['aria-labelledby']);
  useEffect(() => {
    if (iconOnly && !named && isDev()) {
      console.error(
        `[formrail] <Button size="${size}"> has no visible text: it needs an accessible name (aria-label or aria-labelledby).`,
      );
    }
  }, [iconOnly, named, size]);

  const iconSize = ICON_SIZE[size];
  const wrapLabel = !asChild && TEXT_SIZES.has(size) && isPlainText(children);
  const labelClass = size === 'inline' || iconOnly ? '' : wrapLabel ? LABEL_WRAPPED : LABEL_PLAIN;
  const classes = cn(BASE, VARIANT_CLASS[variant], SIZE_CLASS[size], labelClass, className);
  const leading = leadingIcon ? <Icon size={iconSize}>{leadingIcon}</Icon> : null;
  const trailing = trailingIcon ? <Icon size={iconSize}>{trailingIcon}</Icon> : null;

  if (asChild) {
    if (!isValidElement(children) || children.type === Fragment) {
      throw new Error('[formrail] <Button asChild> expects exactly one React element as its child.');
    }
    if (
      isDev() &&
      Number.parseInt(version, 10) < 19 &&
      typeof children.type === 'function' &&
      !(children.type.prototype as { isReactComponent?: unknown } | undefined)?.isReactComponent
    ) {
      console.error(
        '[formrail] <Button asChild>: the child is a function component, which cannot receive the ref on React 18. Wrap it in forwardRef.',
      );
    }
    // Applied to the child itself, not through Slot: Slot only concatenates `className` (no merge
    // of conflicting utilities) and lets the child's props override ours. Here the child's own
    // classes go last through `cn`, and a disabled `<a>` (no native `disabled`) gets
    // `aria-disabled`, `tabIndex=-1` and a blocked click whatever the child declared. The `href`
    // is kept (link semantics), so middle-click / "open in new tab" are not prevented.
    const child = cloneElement(children as ReactElement<{ className?: string }>, {
      className: cn(classes, (children.props as { className?: string }).className),
      ...(disabled ? { onClick: blockClick, 'aria-disabled': true, tabIndex: -1 } : {}),
    } as object);
    return (
      <Slot {...rest} {...(type ? ({ type } as object) : {})} ref={ref} onClick={disabled ? undefined : onClick}>
        {leading}
        <Slottable>{child}</Slottable>
        {trailing}
      </Slot>
    );
  }

  // Icon-only: a lone <svg> child is put on the icon scale like leading/trailing icons.
  const content =
    iconOnly && isValidElement(children) && children.type === 'svg' ? (
      <Icon size={iconSize}>{children as IconElement}</Icon>
    ) : (
      children
    );

  return (
    <button
      {...rest}
      ref={ref as Ref<HTMLButtonElement>}
      type={type ?? 'button'}
      disabled={disabled}
      onClick={onClick}
      className={classes}
    >
      {leading}
      {wrapLabel ? <OpticalLabel>{content}</OpticalLabel> : content}
      {trailing}
    </button>
  );
});
