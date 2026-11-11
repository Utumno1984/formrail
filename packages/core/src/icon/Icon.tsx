import {
  Children,
  cloneElement,
  forwardRef,
  Fragment,
  isValidElement,
  version,
  type ReactElement,
  type Ref,
  type SVGProps,
} from 'react';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// Full literals (Tailwind scan). The pixel values live in tokens.css (`--icon-rop-*`).
const SIZE_CLASS: Record<IconSize, string> = {
  xs: 'size-(--icon-rop-xs)',
  sm: 'size-(--icon-rop-sm)',
  md: 'size-(--icon-rop-md)',
  lg: 'size-(--icon-rop-lg)',
  xl: 'size-(--icon-rop-xl)',
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'ref' | 'size'> {
  /** Side of the square the SVG is forced into, whatever its own width/height. Default `md`. */
  size?: IconSize;
  /**
   * Accessible name. Without it (or empty/blank) the icon is decorative: `aria-hidden`, not
   * focusable, no role. With it: `role="img"` named by this text.
   */
  label?: string;
  /**
   * Exactly one SVG element (any SVG: it is sized and coloured by this component). A component
   * is accepted if it renders an `<svg>` and forwards `className`, `ref` and the ARIA props to it.
   */
  children: ReactElement<SVGProps<SVGSVGElement>>;
}

// A function, not a module-level constant: no top-level work, so the module stays tree-shakable.
const isReact19 = (): boolean => Number.parseInt(version, 10) >= 19;

// Library code cannot tell dev from prod reliably (no `process` typing, bundler-dependent
// replacement), so the misuse warning is emitted once per page load instead.
let warned = false;
function warnInvalidChild(): void {
  if (warned) return;
  warned = true;
  console.warn('[formrail] <Icon> expects exactly one <svg> element as its child; rendering nothing.');
}

/**
 * Wraps any SVG in the icon scale. The SVG itself is cloned (not wrapped), so it is the node that
 * measures the token size, carries the ARIA semantics and inherits the text colour. The child's
 * own `className` and `ref` are preserved.
 */
export const Icon = /* @__PURE__ */ forwardRef<SVGSVGElement, IconProps>(function Icon(
  { size = 'md', label, className, children, ...rest },
  ref,
) {
  const child = Children.count(children) === 1 ? Children.toArray(children)[0] : null;
  if (
    !isValidElement<SVGProps<SVGSVGElement>>(child) ||
    child.type === Fragment ||
    (typeof child.type === 'string' && child.type !== 'svg')
  ) {
    // Declared behaviour: nothing is rendered (never a half-sized, half-labelled foreign node).
    warnInvalidChild();
    return null;
  }

  const childRef = (isReact19() ? child.props.ref : (child as unknown as { ref?: Ref<SVGSVGElement> }).ref) as
    | Ref<SVGSVGElement>
    | undefined;
  const named = typeof label === 'string' && label.trim() !== '';

  return cloneElement(child, {
    ...rest,
    ref: composeRefs(childRef, ref),
    // Default classes first, then the child's own, then the consumer's: the last one wins.
    className: cn('inline-block shrink-0 align-middle', SIZE_CLASS[size], child.props.className, className),
    // The semantics of `label` always win over whatever the child (or `rest`) declared. A name
    // given some other way (`aria-labelledby`) would take precedence over `aria-label`, and a
    // decorative icon must not be reachable by keyboard (`tabIndex`).
    ...(named
      ? { role: 'img', 'aria-label': label, 'aria-labelledby': undefined, 'aria-hidden': undefined, focusable: undefined }
      : {
          role: undefined,
          'aria-label': undefined,
          'aria-labelledby': undefined,
          'aria-hidden': true,
          focusable: 'false',
          tabIndex: undefined,
        }),
  } as Partial<SVGProps<SVGSVGElement>> & { ref: Ref<SVGSVGElement> });
});
