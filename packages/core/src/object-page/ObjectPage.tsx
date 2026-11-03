import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { isDev } from '../internal/is-dev';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';
import { ObjectPageAnchorBar } from './ObjectPageAnchorBar';
import {
  ObjectPageContext,
  type ObjectPageContextValue,
  type ObjectPageSectionEntry,
  type ObjectPageSectionInfo,
} from './ObjectPageContext';
import { footerSlotClass, rootClass, scrollerClass, scrollerStyle } from './object-page-styles';

export type ObjectPageProps = HTMLAttributes<HTMLDivElement> & {
  /** Level of the header's title (1-4); the sections' titles get the next one. Default 1. */
  headingLevel?: 1 | 2 | 3 | 4;
  /**
   * Navigation between the sections: `anchors` (default) shows an Anchor Bar, sticky at the top of the
   * scroller, once there are two or more sections; `none` shows nothing.
   */
  sectionNavigation?: 'anchors' | 'none';
  /** Texts for assistive technology. `anchorBar`: the name of the Anchor Bar's `<nav>` (default "Sections"). */
  labels?: { anchorBar?: string };
  children?: ReactNode;
};

const sameSections = (a: readonly ObjectPageSectionInfo[], b: readonly ObjectPageSectionInfo[]): boolean =>
  a.length === b.length && a.every((s, i) => s.id === b[i]?.id && s.title === b[i]?.title);

/**
 * Root of an Object Page: fills the height of its parent and has ONE scroll container, which holds
 * the header and the sections (the header scrolls away with the content). Below it there is a slot
 * for the footer. Sections register in a registry kept in DOM order. Without a parent height the
 * page grows with its content and the document is the single scroller.
 */
export const ObjectPage = /* @__PURE__ */ forwardRef<HTMLDivElement, ObjectPageProps>(function ObjectPage(
  { headingLevel = 1, sectionNavigation = 'anchors', labels, children, className, ...rest },
  ref,
) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const headerTitle = useRef<HTMLElement | null>(null);
  const mergedRef = useMemo(() => composeRefs(ref, rootRef), [ref]);
  const [footerClaims, setFooterClaims] = useState<readonly string[]>([]);
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);
  const entries = useRef(new Map<string, ObjectPageSectionEntry>());
  const [sections, setSections] = useState<readonly ObjectPageSectionInfo[]>([]);

  // Recomputes the list in DOM order (the order of mounting says nothing about it) and keeps the previous
  // array when nothing changed, so a re-render of the page does not ripple through the consumers.
  const sync = useCallback(() => {
    // A detached element (removed, its cleanup not run yet) has no position to compare: it is left out.
    const connected = Array.from(entries.current.values()).filter((entry) => entry.element.isConnected);
    const sorted = connected.sort((a, b) => {
      if (a.element === b.element) return 0;
      return a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    const next = sorted.map(({ id, readTitle }) => ({ id, title: readTitle() }));
    setSections((prev) => (sameSections(prev, next) ? prev : next));
  }, []);

  const registerSection = useCallback(
    (key: string, entry: ObjectPageSectionEntry) => {
      entries.current.set(key, entry);
      sync();
    },
    [sync],
  );
  const unregisterSection = useCallback(
    (key: string) => {
      entries.current.delete(key);
      sync();
    },
    [sync],
  );

  // Moving a section (a keyed reorder) changes neither its id nor its title: only the DOM tells.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(sync);
    // Text changes too: a title rendered by a component can change without its section re-rendering.
    observer.observe(scroller, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [sync]);

  // Warned once per change of the list, not at every render.
  useEffect(() => {
    if (!isDev()) return;
    const seen = new Set<string>();
    for (const { id } of sections) {
      if (seen.has(id)) console.warn(`ObjectPageSection: duplicate id "${id}". Section ids must be unique within a page.`);
      seen.add(id);
    }
  }, [sections]);

  const getSection = useCallback((id: string) => {
    for (const entry of entries.current.values()) if (entry.id === id && entry.element.isConnected) return entry;
    return undefined;
  }, []);

  const claimFooter = useCallback((key: string) => {
    setFooterClaims((prev) => (prev.includes(key) ? prev : [...prev, key]));
    return () => setFooterClaims((prev) => prev.filter((k) => k !== key));
  }, []);

  const registerHeaderTitle = useCallback((element: HTMLElement | null) => {
    headerTitle.current = element;
  }, []);

  // Where the focus goes when what had it disappears: the header's title, or the root made focusable
  // for the occasion (a permanent `tabindex` would make every click inside the page focus it).
  const focusFallback = useCallback(() => {
    const target = headerTitle.current?.isConnected ? headerTitle.current : rootRef.current;
    if (!target) return;
    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
      // Given only for as long as it holds the focus.
      // `focusout` bubbles: only the target's own counts (the button that just lost the focus fires one too).
      const release = (event: FocusEvent) => {
        if (event.target !== target) return;
        target.removeAttribute('tabindex');
        target.removeEventListener('focusout', release);
      };
      target.addEventListener('focusout', release);
    }
    target.focus({ preventScroll: true });
  }, []);

  const context = useMemo<ObjectPageContextValue>(
    () => ({
      headingLevel,
      scrollerRef,
      footerSlot,
      sections,
      registerSection,
      unregisterSection,
      getSection,
      footerClaims,
      claimFooter,
      registerHeaderTitle,
      focusFallback,
    }),
    [headingLevel, footerSlot, sections, registerSection, unregisterSection, getSection, footerClaims, claimFooter, registerHeaderTitle, focusFallback],
  );

  return (
    <ObjectPageContext.Provider value={context}>
      <div {...rest} ref={mergedRef} className={cn(rootClass, className)}>
        {/* Focusable on purpose: a scroll area with only text in it would otherwise be out of reach of the keyboard.
            It has no role or name: it is one extra Tab stop, announced as a bare group by some screen readers. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <div ref={scrollerRef} tabIndex={0} data-object-page-scroller="" className={scrollerClass} style={scrollerStyle}>
          {sectionNavigation === 'anchors' && sections.length >= 2 ? (
            <ObjectPageAnchorBar label={labels?.anchorBar ?? 'Sections'} />
          ) : null}
          {children}
        </div>
        <div ref={setFooterSlot} data-object-page-footer-slot="" className={footerSlotClass} />
      </div>
    </ObjectPageContext.Provider>
  );
});
