import type { Locator, Page } from '@playwright/test';

/** A colour property of `CSSStyleDeclaration` read by `colourOf` on an element. */
export type ColourProperty = 'backgroundColor' | 'color' | 'borderTopColor' | 'outlineColor';

export interface ColourOptions {
  /** Also return the alpha channel (`[r, g, b, a]`); default `[r, g, b]`. */
  alpha?: boolean;
}

/**
 * A colour as 8-bit channels, resolved by the browser through a canvas, whatever serialization it
 * uses (`rgb()`, `color(srgb ...)`, `color-mix(...)`).
 *
 * - `colourOf(locator, property)`: the computed `property` of the element.
 * - `colourOf(page, '--token')`: the computed custom property on `:root`.
 *
 * Throws when the value is empty or not a colour (e.g. an unset custom property), where the canvas
 * would otherwise keep its default fill and report black.
 */
export function colourOf(target: Locator, property: ColourProperty, options?: ColourOptions): Promise<number[]>;
export function colourOf(target: Page, token: `--${string}`, options?: ColourOptions): Promise<number[]>;
export function colourOf(target: Locator | Page, what: string, { alpha = false }: ColourOptions = {}): Promise<number[]> {
  const element = 'goto' in target ? target.locator(':root') : target;
  return element.evaluate(
    (el, { what, alpha }) => {
      const style = getComputedStyle(el);
      const value = what.startsWith('--') ? style.getPropertyValue(what).trim() : (style[what as 'color'] as string);
      if (!CSS.supports('color', value)) throw new Error(`colourOf: ${what} is ${JSON.stringify(value)}, not a colour`);
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, alpha ? 4 : 3));
    },
    { what, alpha },
  );
}
