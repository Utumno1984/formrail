import { createContext, useContext, type RefObject } from 'react';
import { isDev } from '../internal/is-dev';
import type { TitleLevel } from '../typography/Title';

/** One entry of the section registry: what an Anchor Bar needs to list and reach a section. */
export interface ObjectPageSectionInfo {
  /** The DOM id of the `<section>`. */
  id: string;
  /** The plain text of the section's title (never the icon or other nodes of it). */
  title: string;
}

/** What a section tells the registry about itself. `element` is what gives the DOM order. */
export interface ObjectPageSectionEntry {
  id: string;
  element: HTMLElement;
  /** Reads the title as the region's accessible name sees it (from the DOM, so a title rendered by a component counts). */
  readTitle: () => string;
  /** Moves the focus to the section's title without scrolling (the title is `tabIndex=-1`). */
  focusTitle: () => void;
}

/** Text of a node as a screen reader names it: `aria-hidden` subtrees skipped, `aria-label` used, spaces normalized. */
export function accessibleText(node: Node): string {
  const walk = (n: Node): string => {
    if (n.nodeType === 3) return n.textContent ?? '';
    if (!(n instanceof Element) || n.getAttribute('aria-hidden') === 'true') return '';
    const label = n.getAttribute('aria-label');
    if (label) return label;
    return Array.from(n.childNodes).map(walk).join('');
  };
  return walk(node).replace(/\s+/g, ' ').trim();
}

export interface ObjectPageContextValue {
  /** Level of the header's title; the sections' titles are one level below. */
  headingLevel: TitleLevel;
  /** The page's one scroll container (header and sections live inside it). */
  scrollerRef: RefObject<HTMLDivElement | null>;
  /** The slot below the scroller, where the footer will go. `null` until the page has mounted. */
  footerSlot: HTMLDivElement | null;
  /** The registered sections, in DOM order (not in mount order). */
  sections: readonly ObjectPageSectionInfo[];
  /** Registers (or updates) a section. `key` is unique per mounted section. */
  registerSection: (key: string, entry: ObjectPageSectionEntry) => void;
  unregisterSection: (key: string) => void;
  /** The registered section with this DOM id (the first one, if the id is duplicated). */
  getSection: (id: string) => ObjectPageSectionEntry | undefined;
  /** Keys of the mounted footers, in mount order: only the first one is rendered. */
  footerClaims: readonly string[];
  /** A footer claims the slot; returns the release. */
  claimFooter: (key: string) => () => void;
  /** Hands the header's title element to the page (`null` when the header unmounts). */
  registerHeaderTitle: (element: HTMLElement | null) => void;
  /** Moves the focus (without scrolling) to the header's title, or to the page root when there is no header. */
  focusFallback: () => void;
}

export const ObjectPageContext = /* @__PURE__ */ createContext<ObjectPageContextValue | null>(null);

/**
 * The page's context. Outside an `ObjectPage` it throws in development (a clear message instead
 * of a missing scroller later) and returns `null` in production, where the caller degrades.
 */
export function useObjectPageContext(consumer: string): ObjectPageContextValue | null {
  const context = useContext(ObjectPageContext);
  if (!context && isDev()) {
    throw new Error(`${consumer} must be rendered inside an <ObjectPage>.`);
  }
  return context;
}

/**
 * The sections of the surrounding `ObjectPage`, in DOM order, as `{ id, title }`. Updated when a
 * section is added, removed, renamed or moved. Internal: the Anchor Bar builds on it.
 */
export function useObjectPageSections(): readonly ObjectPageSectionInfo[] {
  return useObjectPageContext('useObjectPageSections')?.sections ?? [];
}
