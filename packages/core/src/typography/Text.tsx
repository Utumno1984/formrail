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
    | ({
        /** Element rendered, a closed set. Default `p`; `label` is the other branch of the type and also takes `htmlFor`. */
        as?: 'p' | 'span' | 'div';
        /** Only with `as="label"`: the id of the control the label names. */
        htmlFor?: never;
      } & HTMLAttributes<HTMLElement>)
    | ({
        /** Renders a `<label>`, which also takes `htmlFor`. */
        as: 'label';
      } & LabelHTMLAttributes<HTMLElement>)
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
      // cancels out). Without `cap` support (Safari < 17.2) the declaration would be dropped and `middle`
      // alone leaves the icon ~1px too low, so a fixed -0.1em stands in for that offset there.
      className={cn(
        'm-0 [&_svg]:my-[-0.25em] [&>svg]:relative [&>svg]:top-[-0.1em] [&>svg]:supports-[top:1cap]:top-[calc(0.5ex-0.5cap)] [&>svg]:align-middle',
        VARIANT_CLASS[variant],
        mono ? 'font-rop-mono' : 'font-rop-sans',
        className,
      )}
    />
  );
});
