// Test-only helpers (not exported from the package): a jsdom layout for the virtualized table and
// the HTML normalization used to compare it with the Free table.
import { vi } from 'vitest';

export const PITCH = 47;
export const HEAD = 47;
/** `clientHeight` of the scroller: the header + 10 rows. */
export const CLIENT = HEAD + 10 * PITCH;

/** The table's scroll container: the focusable element holding the `<table>`. */
const isScroller = (el: Element): boolean => el.getAttribute('tabindex') === '0' && el.firstElementChild?.tagName === 'TABLE';

const rect = (top: number, height: number): DOMRect =>
  ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

/**
 * jsdom has no layout: give the scroller a `clientHeight`, a real `scrollTop` (stored, clamped at 0),
 * the header and the data rows a height, and the `<tbody>` its offset. `pitch` can change mid-test.
 * Returns a restore function.
 */
export function mockTableLayout(options: { pitch?: number } = {}) {
  const state = { pitch: options.pitch ?? PITCH };
  const tops = new WeakMap<Element, number>();
  const proto = Element.prototype;
  const htmlProto = HTMLElement.prototype;
  const saved = {
    scrollTop: Object.getOwnPropertyDescriptor(proto, 'scrollTop'),
    clientHeight: Object.getOwnPropertyDescriptor(proto, 'clientHeight'),
    rect: Object.getOwnPropertyDescriptor(proto, 'getBoundingClientRect'),
    scrollIntoView: Object.getOwnPropertyDescriptor(htmlProto, 'scrollIntoView'),
  };
  Object.defineProperty(proto, 'scrollTop', {
    configurable: true,
    get(this: Element) {
      return tops.get(this) ?? 0;
    },
    set(this: Element, value: number) {
      tops.set(this, Math.max(0, value));
    },
  });
  Object.defineProperty(proto, 'clientHeight', {
    configurable: true,
    get(this: Element) {
      return isScroller(this) ? CLIENT : 0;
    },
  });
  Object.defineProperty(proto, 'getBoundingClientRect', {
    configurable: true,
    value(this: Element) {
      const scroller = this.closest('[tabindex="0"]');
      const scrolled = scroller ? (tops.get(scroller) ?? 0) : 0;
      if (this.tagName === 'THEAD') return rect(0, HEAD);
      if (this.tagName === 'TBODY') return rect(HEAD - scrolled, 0);
      if (this.tagName === 'TR' && this.parentElement?.tagName === 'TBODY' && !this.hasAttribute('data-rop-spacer')) {
        return rect(0, state.pitch);
      }
      return rect(0, 0);
    },
  });
  return {
    state,
    restore() {
      for (const [key, descriptor] of Object.entries(saved)) {
        const target = key === 'scrollIntoView' ? htmlProto : proto;
        const name = key === 'rect' ? 'getBoundingClientRect' : key;
        if (descriptor) Object.defineProperty(target, name, descriptor);
        else delete (target as unknown as Record<string, unknown>)[name];
      }
    },
  };
}

/** A ResizeObserver stub that counts constructions and keeps the callbacks to trigger them. */
export function installResizeObserverStub() {
  const instances: { callback: ResizeObserverCallback; observed: Element[] }[] = [];
  const previous = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  class Stub {
    private entry: { callback: ResizeObserverCallback; observed: Element[] };
    constructor(callback: ResizeObserverCallback) {
      this.entry = { callback, observed: [] };
      instances.push(this.entry);
    }
    observe(el: Element) {
      this.entry.observed.push(el);
    }
    unobserve(el: Element) {
      this.entry.observed = this.entry.observed.filter((e) => e !== el);
    }
    disconnect() {
      this.entry.observed = [];
    }
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = Stub;
  return {
    instances,
    trigger() {
      for (const i of instances) i.callback([], i as unknown as ResizeObserver);
    },
    restore() {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = previous;
    },
  };
}

/** `scroll` listeners added to any element (spy on `addEventListener`). */
export function spyScrollListeners() {
  const spy = vi.spyOn(EventTarget.prototype, 'addEventListener');
  return () => spy.mock.calls.filter(([type]) => type === 'scroll').length;
}

/**
 * The HTML with React's generated ids (`useId`) renamed in order of appearance: two trees of different
 * depth (the Pro table wraps the Shell in one more component) get different raw ids for the same DOM.
 */
export function normalizeIds(html: string): string {
  const names = new Map<string, string>();
  return html.replace(/_r_[0-9a-z]+_|«r[0-9a-z]+»|:r[0-9a-z]+:/g, (token) => {
    if (!names.has(token)) names.set(token, `id${names.size}`);
    return names.get(token)!;
  });
}
