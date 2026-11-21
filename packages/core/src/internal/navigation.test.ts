import { describe, expect, it, vi } from 'vitest';
import { handleNavigationClick, isModifiedClick, type NavigationClickLike } from './navigation';

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
