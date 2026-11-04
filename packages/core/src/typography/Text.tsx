import { forwardRef, type HTMLAttributes, type LabelHTMLAttributes, type Ref } from 'react';
import { cn } from '../utils/cn';

export type TextVariant = 'body' | 'caption' | 'label';

// Full literals, so that Tailwind's source scan emits each utility.
const VARIANT_CLASS: Record<TextVariant, string> = {
  body: 'text-rop-body',
  caption: 'text-rop-caption',
  label: 'text-rop-label font-[500]',
};

interface TextBaseProps {
  /** Typographic scale step. Independent of `mono`. Default: `body`. */
  variant?: TextVariant;
  /** Monospace family (codes, identifiers), whatever the `variant`. */
  mono?: boolean;
}

export type TextProps = TextBaseProps &
  (
    | ({ as?: 'p' | 'span' | 'div'; htmlFor?: never } & HTMLAttributes<HTMLElement>)
    | ({ as: 'label' } & LabelHTMLAttributes<HTMLElement>)
  );

/** Body text. Renders a `<p>` unless `as` says otherwise (closed set: p, span, div, label). */
export const Text = /* @__PURE__ */ forwardRef<HTMLElement, TextProps>(function Text(
  { as = 'p', variant = 'body', mono = false, className, ...rest },
  ref,
) {
  const Tag = as as 'p';
  return (
    <Tag
      {...(rest as HTMLAttributes<HTMLParagraphElement>)}
      ref={ref as Ref<HTMLParagraphElement>}
      // `[&_svg]:my-[-0.25em]`: an icon inline in the text barely touches the line box, so a
      // 16px icon in a caption line keeps the line height (outside text <Icon> has no margin).
      // An icon that is a direct child is centred on the cap height of the line, not on the
      // x-height middle of `vertical-align: middle` (1.2-2px lower, ticket #217): `middle` puts it
      // on baseline + 0.5ex and the relative offset adds 0.5ex - 0.5cap (same font, so the x-height
      // cancels out). Without `cap` support the offset is dropped and `middle` remains.
      className={cn(
        'm-0 [&_svg]:my-[-0.25em] [&>svg]:relative [&>svg]:top-[calc(0.5ex-0.5cap)] [&>svg]:align-middle',
        VARIANT_CLASS[variant],
        mono ? 'font-rop-mono' : 'font-rop-sans',
        className,
      )}
    />
  );
});
