import type { HTMLAttributes } from 'react';
import { cn } from '../utils/cn';

/**
 * Vertical position shared by every icon (or control drawn like one) that sits next to a line of
 * text: its centre is on the middle of the CAPITAL letters of that line (baseline - 0.5cap),
 * whatever the font.
 *
 * Why not simply centre the icon on the line box: where the glyphs sit inside a line box depends on
 * the font's ascent/descent metrics, and `font-rop-sans` (system-ui first) resolves to a different
 * font on every platform. Measured with the same CSS (ticket #217, body text, 20px line): the
 * cap-height centre is ~0.3px above the line-box centre with Segoe UI and Liberation Sans/Arial,
 * but ~2px above it with WenQuanYi Zen Hei (what `system-ui` becomes in the Linux image of the
 * visual tests); and an inline icon on `vertical-align: middle` (the x-height middle) sits 1.2-2px
 * below it with every font. So a box centred on the line, or any fixed px correction, is right for
 * one font only.
 *
 * How: the slot is one line tall (its line box is the strut of the inherited font and
 * line-height, i.e. exactly the first line of the adjacent text when both share font, size,
 * line-height and top). Inside it a zero-height inline-block is put on `baseline + 0.5ex` by
 * `vertical-align: middle` and moved by `0.5ex - 0.5cap`, both resolved against the same font, so
 * the x-height cancels out and it lands on `baseline - 0.5cap`. The content is then centred on
 * that point by a -50% translation of its own height. The zero-height box never grows the line, so
 * the slot's footprint is the same for every font and icon size. Where the `cap` unit is not
 * supported (Safari < 17.2) the declaration would be dropped and the icon would sit on the x-height
 * middle, ~1px too low; there a fixed `-0.1em` approximates the same offset instead.
 *
 * The slot must inherit the font, size and line-height of the text it is aligned with, and start
 * at the same top as that text's first line (same padding). `className` goes on the outer slot.
 */
export function CapIconSlot({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...rest} className={cn('block shrink-0', className)}>
      <span className="relative top-[-0.1em] supports-[top:1cap]:top-[calc(0.5ex-0.5cap)] inline-block h-0 align-middle">
        <span className="relative flex [translate:0_-50%]">{children}</span>
      </span>
    </span>
  );
}
