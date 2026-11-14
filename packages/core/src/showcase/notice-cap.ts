// Story-only (#470): how tall the notice row of the invoice editor may be (the `notice` of `useAddons`, rendered above
// the page's scroller). Not exported by the package.
import { useLayoutEffect, type RefObject } from 'react';

/** The CSS custom property the cap is written to, on the notice row (`max-height: var(--…, 40vh)`). */
export const NOTICE_CAP_VAR = '--showcase-editor-notice-max';

/** At most this share of the visible height of the editor: a long notice scrolls on its own. */
export const NOTICE_SHARE = 0.4;

/**
 * The room the page's scroller keeps under the notice, in rem: 10rem (160px at 16px). The sticky Anchor Bar at its top
 * (47px) plus one whole Field (label, control and the one-line message slot every Field reserves, which also holds
 * the "Changed on the server too." help of a conflict: 90px) plus that Field's own scroll margins above and below
 * (0.5rem each: 16px) make 153px: the field being typed in always fits whole under the Anchor Bar.
 */
export const EDITOR_MIN_REM = 10;

/**
 * The least the notice keeps, in rem: 3rem (48px). Its top margin (12px), its padding (12px) and the first line of
 * its title (20px): the warning icon and "Warning: This invoice was…" stay in view, the rest scrolls inside the row.
 * When the room runs out (a short screen with the virtual keyboard open) the notice keeps this and the editor the rest.
 */
export const NOTICE_MIN_REM = 3;

/** What the cap is computed from, in CSS px of the layout viewport (as `getBoundingClientRect`). */
export interface NoticeCapInput {
  /** Top of the editor (where the notice row starts). */
  frameTop: number;
  /** Bottom of the editor. */
  frameBottom: number;
  /** Top of the page's footer slot: the bottom of the scroller, whatever the notice's height. */
  footerTop: number;
  /** Bottom of what the user sees: the visual viewport's bottom (above the virtual keyboard), else the window's. */
  visibleBottom: number;
  /** Height of the layout viewport (`window.innerHeight`). */
  viewportHeight: number;
  /** Root font size, px per rem. */
  rem: number;
}

/**
 * The notice row's maximum height, px. 40% of the visible part of the editor, lowered so that the scroller keeps
 * {@link EDITOR_MIN_REM} above the line under which a focused Field never stays, and never below
 * {@link NOTICE_MIN_REM}.
 *
 * That line is the scroller's bottom raised by the height the virtual keyboard covers: a focused Field scrolls
 * itself to end that far above the bottom of its scroll container (its `scroll-margin-bottom` is the keyboard's
 * height), so with the keyboard open a field the user starts typing in lands above it, and only the room between
 * the notice and that line keeps it in view. Without a keyboard the line is the scroller's bottom.
 */
export function noticeCap({ frameTop, frameBottom, footerTop, visibleBottom, viewportHeight, rem }: NoticeCapInput): number {
  const keyboard = Math.max(0, viewportHeight - visibleBottom);
  const visibleFrame = Math.max(0, Math.min(frameBottom, visibleBottom) - frameTop);
  const editorRoom = footerTop - keyboard - frameTop - EDITOR_MIN_REM * rem;
  return Math.max(NOTICE_MIN_REM * rem, Math.min(NOTICE_SHARE * visibleFrame, editorRoom));
}

/**
 * Keeps {@link NOTICE_CAP_VAR} on `noticeRef` in step with the room of the editor `frameRef` (its size, its footer,
 * the window and the visual viewport: the virtual keyboard resizes only the latter). Written straight to the
 * element (no render). Pinch-zoom also resizes the visual viewport: like Field, the keyboard is read at scale 1 only.
 */
export function useNoticeCap(frameRef: RefObject<HTMLElement | null>, noticeRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const notice = noticeRef.current;
    const view = frame?.ownerDocument.defaultView;
    if (!frame || !notice || !view) return undefined;
    const vv = view.visualViewport;
    const update = () => {
      const box = frame.getBoundingClientRect();
      const footer = frame.querySelector('[data-object-page-footer-slot]');
      const visibleBottom = vv && vv.scale === 1 ? vv.offsetTop + vv.height : view.innerHeight;
      const cap = noticeCap({
        frameTop: box.top,
        frameBottom: box.bottom,
        footerTop: footer ? footer.getBoundingClientRect().top : box.bottom,
        visibleBottom,
        viewportHeight: view.innerHeight,
        rem: parseFloat(view.getComputedStyle(frame.ownerDocument.documentElement).fontSize) || 16,
      });
      notice.style.setProperty(NOTICE_CAP_VAR, `${Math.floor(cap)}px`);
    };
    update();
    const observer = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(update) : null;
    observer?.observe(frame);
    const footer = frame.querySelector('[data-object-page-footer-slot]');
    if (footer) observer?.observe(footer);
    view.addEventListener('resize', update);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    return () => {
      observer?.disconnect();
      view.removeEventListener('resize', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
    };
  }, [frameRef, noticeRef]);
}
