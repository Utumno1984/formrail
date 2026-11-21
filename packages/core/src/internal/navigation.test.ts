import { describe, expect, it, vi } from 'vitest';
import {
  handleNavigationClick,
  hasNavigableHref,
  isAppNavigationClick,
  isModifiedClick,
  type NavigationClickLike,
} from './navigation';

const click = (over: Partial<NavigationClickLike> = {}) => {
  const event = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    ...over,
    preventDefault: vi.fn(() => {
      event.defaultPrevented = true;
    }),
  };
  return event;
};

describe('isModifiedClick', () => {
  it('a plain primary click is not modified', () => {
    expect(isModifiedClick(click())).toBe(false);
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
    ['the middle button', { button: 1 }],
    ['the secondary button', { button: 2 }],
  ])('a click with %s belongs to the browser', (_, over) => {
    expect(isModifiedClick(click(over))).toBe(true);
  });
});

describe('hasNavigableHref', () => {
  it('a non-empty string is an href; undefined, null and the empty string are not', () => {
    expect(hasNavigableHref('/a')).toBe(true);
    expect(hasNavigableHref('#')).toBe(true);
    expect(hasNavigableHref('')).toBe(false);
    expect(hasNavigableHref(undefined)).toBe(false);
    expect(hasNavigableHref(null)).toBe(false);
  });
});

describe('isAppNavigationClick', () => {
  it('with a native navigation (default): only a plain primary click nobody cancelled is the app’s', () => {
    expect(isAppNavigationClick(click())).toBe(true);
    expect(isAppNavigationClick(click({ shiftKey: true }))).toBe(false);
    expect(isAppNavigationClick(click({ button: 1 }))).toBe(false);
    expect(isAppNavigationClick(click({ defaultPrevented: true }))).toBe(false);
  });

  it('without a native navigation: every click nobody cancelled is the app’s, modifiers included', () => {
    expect(isAppNavigationClick(click({ shiftKey: true }), { native: false })).toBe(true);
    expect(isAppNavigationClick(click({ metaKey: true, altKey: true }), { native: false })).toBe(true);
    expect(isAppNavigationClick(click({ ctrlKey: true, defaultPrevented: true }), { native: false })).toBe(false);
  });
});

describe('handleNavigationClick', () => {
  it('a plain primary click with a callback: native navigation cancelled, callback called once with the event', () => {
    const event = click();
    const onNavigate = vi.fn();
    expect(handleNavigationClick(event, onNavigate)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(event);
  });

  it('the native navigation is cancelled before the callback runs', () => {
    const event = click();
    let preventedFirst = false;
    handleNavigationClick(event, (e) => {
      preventedFirst = e.defaultPrevented;
    });
    expect(preventedFirst).toBe(true);
  });

  it('without a callback the browser navigates: nothing is cancelled', () => {
    const event = click();
    expect(handleNavigationClick(event, undefined)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
    ['the middle button', { button: 1 }],
  ])('a click with %s: the callback is not called and the native navigation is not cancelled', (_, over) => {
    const event = click(over);
    const onNavigate = vi.fn();
    expect(handleNavigationClick(event, onNavigate)).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('a click another handler already cancelled is left alone', () => {
    const event = click({ defaultPrevented: true });
    const onNavigate = vi.fn();
    expect(handleNavigationClick(event, onNavigate)).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it.each([
    ['a plain click', {}],
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
    ['the middle button', { button: 1 }],
  ])('without a native navigation (no href), %s goes to the callback: nothing is left to the browser', (_, over) => {
    const event = click(over);
    const onNavigate = vi.fn();
    expect(handleNavigationClick(event, onNavigate, { native: false })).toBe(true);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('without a native navigation, a click already cancelled or no callback: nothing happens', () => {
    const cancelled = click({ ctrlKey: true, defaultPrevented: true });
    const onNavigate = vi.fn();
    expect(handleNavigationClick(cancelled, onNavigate, { native: false })).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();
    const noCallback = click({ ctrlKey: true });
    expect(handleNavigationClick(noCallback, undefined, { native: false })).toBe(false);
    expect(noCallback.preventDefault).not.toHaveBeenCalled();
  });

  it('native defaults to true: an explicit native: true is the link rule', () => {
    const onNavigate = vi.fn();
    expect(handleNavigationClick(click({ ctrlKey: true }), onNavigate, { native: true })).toBe(false);
    expect(handleNavigationClick(click({ ctrlKey: true }), onNavigate, {})).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('an error thrown by the callback propagates (it is not swallowed), after the native navigation was cancelled', () => {
    const event = click();
    expect(() =>
      handleNavigationClick(event, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
});
