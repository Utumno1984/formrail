/**
 * How the engine reports `scrollLeft` on a right-to-left scroll container. Engines have not always
 * agreed, and the difference flips both which side hides content and which way `scrollBy` moves:
 *
 * - `negative` (the standard, current Chromium/Firefox/Safari): 0 at the inline start (the right
 *   edge), decreasing to `-max` at the inline end.
 * - `reverse` (legacy, e.g. old Edge/IE): 0 at the inline start, increasing to `+max` at the end.
 * - `default` (legacy, e.g. old WebKit/Chromium): `+max` at the inline start, decreasing to 0 at
 *   the end (the LTR coordinate system kept as is).
 */
export type RtlScrollType = 'negative' | 'reverse' | 'default';

let cached: RtlScrollType | undefined;

/**
 * Detects the convention once, with an off-screen RTL probe that overflows by a few pixels. An
 * environment without layout (jsdom, no `document`) reports the standard one, uncached, so a
 * later call in a real layout still measures.
 */
export function rtlScrollType(): RtlScrollType {
  if (cached) return cached;
  if (typeof document === 'undefined' || !document.body) return 'negative';
  const probe = document.createElement('div');
  probe.dir = 'rtl';
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;top:-9999px;width:4px;height:1px;overflow:scroll;visibility:hidden;direction:rtl';
  const inner = document.createElement('div');
  inner.style.cssText = 'width:8px;height:1px';
  probe.appendChild(inner);
  document.body.appendChild(probe);
  try {
    if (probe.scrollWidth <= probe.clientWidth) return 'negative';
    let type: RtlScrollType;
    if (probe.scrollLeft > 0) type = 'default';
    else {
      // At the start, 0 in both remaining conventions: a positive position exists only in `reverse`
      // (`negative` clamps it back to 0).
      probe.scrollLeft = 1;
      type = probe.scrollLeft > 0 ? 'reverse' : 'negative';
    }
    cached = type;
    return type;
  } finally {
    probe.remove();
  }
}

/** Tests only: forget the detected convention. */
export function resetRtlScrollType(): void {
  cached = undefined;
}

/** Distance scrolled from the inline start, whatever the direction and the engine's convention. */
export function scrollFromStart(el: HTMLElement, rtl: boolean): number {
  if (!rtl) return el.scrollLeft;
  const type = rtlScrollType();
  if (type === 'negative') return -el.scrollLeft;
  if (type === 'reverse') return el.scrollLeft;
  return el.scrollWidth - el.clientWidth - el.scrollLeft;
}

/** The sign of a `scrollLeft` change that moves towards the inline end. */
export function towardsEndSign(rtl: boolean): 1 | -1 {
  if (!rtl) return 1;
  return rtlScrollType() === 'reverse' ? 1 : -1;
}
