import { useCallback, useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react';
import { cn } from '../utils/cn';
import { useObjectPageContext } from './ObjectPageContext';
import {
  anchorBarClass,
  anchorBarItemClass,
  anchorBarLinkActiveClass,
  anchorBarLinkClass,
  anchorBarLinkIdleClass,
  anchorBarListClass,
  SECTION_GAP_PX,
} from './object-page-styles';
import { useScrollSpy } from './use-scroll-spy';

export const STICKY_OFFSET_VAR = '--rop-object-page-sticky-offset';

// `useLayoutEffect` warns on the server; the bar is only rendered once sections registered (client side).
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface ObjectPageAnchorBarProps {
  label: string;
}

/**
 * The Anchor Bar: a sticky `<nav>` with one link per section (`href="#id"`, so open-in-new-tab and
 * copy-link keep working). A plain click scrolls the page's own scroller instead of the document,
 * leaves the URL alone and moves the focus to the section's title. Rendered by `ObjectPage`.
 */
export function ObjectPageAnchorBar({ label }: ObjectPageAnchorBarProps) {
  const page = useObjectPageContext('ObjectPageAnchorBar');
  const scrollerRef = page?.scrollerRef;
  const sections = page?.sections ?? [];
  const getSection = page?.getSection;
  const barRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const noScroller = useRef<HTMLElement | null>(null);
  const ids = sections.map((s) => s.id);
  const getElement = useCallback((id: string) => getSection?.(id)?.element, [getSection]);
  const { activeId, pin } = useScrollSpy({ scrollerRef: scrollerRef ?? noScroller, barRef, ids, getElement });

  // Publishes the bar's measured height, which sections use as `scroll-margin-top`; follows resizes
  // (the viewport width changes the bar's height, and so does a font-size change).
  useIsoLayoutEffect(() => {
    const scroller = scrollerRef?.current;
    const bar = barRef.current;
    if (!scroller || !bar) return undefined;
    const publish = () => scroller.style.setProperty(STICKY_OFFSET_VAR, bar.getBoundingClientRect().height + 'px');
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(bar);
    return () => {
      observer?.disconnect();
      scroller.style.removeProperty(STICKY_OFFSET_VAR);
    };
  }, [scrollerRef]);

  // Keeps the active link visible in the (horizontally scrolling) list. Scrolls the list itself, never
  // `scrollIntoView`, which would also move the vertical scroller.
  useEffect(() => {
    const list = listRef.current;
    if (!list || !activeId) return;
    const link = Array.from(list.querySelectorAll<HTMLElement>('a')).find((a) => a.dataset.sectionId === activeId);
    if (!link) return;
    const listBox = list.getBoundingClientRect();
    const linkBox = link.getBoundingClientRect();
    if (linkBox.left >= listBox.left && linkBox.right <= listBox.right) return;
    // Centers rather than aligning to the nearest edge: it matches what the native focus scroll does
    // for an off-screen link, so the final position does not depend on which links were active on the
    // way there. The browser clamps at both ends of the list.
    list.scrollLeft += (linkBox.left + linkBox.right) / 2 - (listBox.left + listBox.right) / 2;
  }, [activeId]);

  const navigate = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    // Modified clicks keep their default (new tab, copy link...); the href is real.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const scroller = scrollerRef?.current;
    const target = getSection?.(id);
    if (!scroller || !target) return;
    event.preventDefault();
    // Where the scroller has to be for the section to sit just below the bar (SECTION_GAP_PX of room for
    // the title's focus indicator), clamped to what the browser can do: it cannot go past the end.
    const landing = () => {
      const barHeight = barRef.current?.getBoundingClientRect().height ?? 0;
      const wanted = target.element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - barHeight - SECTION_GAP_PX;
      return Math.min(Math.max(0, wanted), Math.max(0, scroller.scrollHeight - scroller.clientHeight));
    };
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scrollTo = (top: number) => {
      if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
      else scroller.scrollTop = top;
    };
    const top = landing();
    pin(id, top, { landing, scrollTo });
    scrollTo(top);
    target.focusTitle();
  };

  return (
    <nav ref={barRef} aria-label={label} className={anchorBarClass}>
      <ul ref={listRef} className={anchorBarListClass}>
        {sections.map(({ id, title }) => {
          const active = id === activeId;
          return (
            <li key={id} className={anchorBarItemClass}>
              <a
                href={'#' + id}
                data-section-id={id}
                aria-current={active ? 'location' : undefined}
                className={cn(anchorBarLinkClass, active ? anchorBarLinkActiveClass : anchorBarLinkIdleClass)}
                onClick={(event) => navigate(event, id)}
              >
                {title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
