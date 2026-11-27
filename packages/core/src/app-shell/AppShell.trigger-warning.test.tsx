import { act, cleanup, render } from '@testing-library/react';
import { useEffect, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell, AppShellHeader, AppShellMain, AppShellNav, AppShellNavLink, AppShellNavTrigger, NO_TRIGGER_SETTLE_MS } from './AppShell';
import { APP_SHELL_WIDE_QUERY } from './breakpoint';

// #721: below the breakpoint the navigation column is not displayed and only `AppShellNavTrigger` opens the
// navigation, so a shell with an `AppShellNav` and no trigger leaves it out of reach there. In development a
// warning says so, only while that is the case: the viewport is below the breakpoint and no trigger has been mounted
// for `NO_TRIGGER_SETTLE_MS`. In production nothing is logged.

/**
 * A `matchMedia` whose breakpoint query follows `state.wide`, with its `change` listeners kept, so that a test can
 * move the viewport across the breakpoint (`cross`).
 */
function viewport(wide: boolean) {
  const state = { wide };
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === APP_SHELL_WIDE_QUERY ? state.wide : false;
    },
    media: query,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  }));
  return {
    listeners,
    cross(next: boolean) {
      state.wide = next;
      act(() => {
        for (const listener of [...listeners]) listener({ matches: next } as MediaQueryListEvent);
      });
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// In steps of at most 10 ms, each in its own `act`: a state set by a timer of the app (a header loaded after a fetch)
// is committed before the next timers run, as in a browser.
const wait = (ms: number) => {
  for (let left = ms; left > 0; left -= 10) {
    act(() => {
      vi.advanceTimersByTime(Math.min(10, left));
    });
  }
};

function Shell({ start, nav = true }: { start?: ReactNode; nav?: boolean }) {
  return (
    <AppShell>
      <AppShellHeader start={start ?? <span>App one</span>} />
      {nav ? (
        <AppShellNav>
          <AppShellNavLink href="#a" active>
            Section A
          </AppShellNavLink>
        </AppShellNav>
      ) : null}
      <AppShellMain>
        <p>Content</p>
      </AppShellMain>
    </AppShell>
  );
}

const trigger = (
  <>
    <AppShellNavTrigger />
    <span>App one</span>
  </>
);

describe('AppShell: an AppShellNav with no AppShellNavTrigger', () => {
  it('below the breakpoint: one console.warn in development once the settling time is over, naming the components, once per shell', () => {
    viewport(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { rerender } = render(<Shell />);
    wait(NO_TRIGGER_SETTLE_MS - 1);
    expect(warn).not.toHaveBeenCalled();
    wait(1);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toMatch(/^\[formrail\] <AppShell> has an <AppShellNav> and no <AppShellNavTrigger>: /);
    expect(message).toContain('64rem');
    rerender(<Shell start={<span>App two</span>} />);
    wait(NO_TRIGGER_SETTLE_MS * 2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('logs nothing in production', () => {
    viewport(false);
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<Shell />);
    wait(NO_TRIGGER_SETTLE_MS * 2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs nothing with a trigger, nor without a navigation', () => {
    viewport(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { unmount } = render(<Shell start={trigger} />);
    wait(NO_TRIGGER_SETTLE_MS * 2);
    unmount();
    render(<Shell nav={false} />);
    wait(NO_TRIGGER_SETTLE_MS * 2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a trigger mounted by an effect after the mount counts: nothing is logged', () => {
    viewport(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    function LateTrigger() {
      const [shown, setShown] = useState(false);
      useEffect(() => setShown(true), []);
      return shown ? <AppShellNavTrigger /> : null;
    }
    render(<Shell start={<LateTrigger />} />);
    wait(NO_TRIGGER_SETTLE_MS * 2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a header loaded after a fetch (the trigger mounted by a timer, within the settling time): nothing is logged', () => {
    viewport(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    function HeaderAfterFetch({ delay }: { delay: number }) {
      const [user, setUser] = useState<string | null>(null);
      useEffect(() => {
        const timer = setTimeout(() => setUser('Ada'), delay);
        return () => clearTimeout(timer);
      }, [delay]);
      return user ? (
        <>
          <AppShellNavTrigger />
          <span>{user}</span>
        </>
      ) : null;
    }
    const { unmount } = render(<Shell start={<HeaderAfterFetch delay={50} />} />);
    wait(NO_TRIGGER_SETTLE_MS * 2);
    unmount();
    render(<Shell start={<HeaderAfterFetch delay={NO_TRIGGER_SETTLE_MS - 100} />} />);
    wait(NO_TRIGGER_SETTLE_MS * 2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a shell for wide screens only, in a wide viewport: nothing is logged; the check runs again when the viewport becomes narrow', () => {
    const view = viewport(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<Shell />);
    wait(NO_TRIGGER_SETTLE_MS * 5);
    expect(warn).not.toHaveBeenCalled();
    // Narrow for less than the settling time, then wide again: still nothing.
    view.cross(false);
    wait(NO_TRIGGER_SETTLE_MS - 1);
    view.cross(true);
    wait(NO_TRIGGER_SETTLE_MS * 2);
    expect(warn).not.toHaveBeenCalled();
    // Narrow for good: the navigation is out of reach now.
    view.cross(false);
    wait(NO_TRIGGER_SETTLE_MS);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('without matchMedia the viewport is not known: nothing is logged', () => {
    vi.stubGlobal('matchMedia', undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<Shell />);
    wait(NO_TRIGGER_SETTLE_MS * 2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a matchMedia that throws: the viewport is not known, nothing is logged', () => {
    vi.stubGlobal('matchMedia', () => {
      throw new Error('matchMedia is not available');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<Shell />);
    wait(NO_TRIGGER_SETTLE_MS * 2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a nav that unmounts and mounts again: still one warning per shell', () => {
    viewport(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { rerender } = render(<Shell />);
    wait(NO_TRIGGER_SETTLE_MS);
    expect(warn).toHaveBeenCalledTimes(1);
    rerender(<Shell nav={false} />);
    wait(NO_TRIGGER_SETTLE_MS);
    rerender(<Shell />);
    wait(NO_TRIGGER_SETTLE_MS * 2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a trigger removed after the mount: one warning once the settling time is over', () => {
    viewport(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { rerender } = render(<Shell start={trigger} />);
    wait(NO_TRIGGER_SETTLE_MS * 2);
    expect(warn).not.toHaveBeenCalled();
    rerender(<Shell />);
    wait(NO_TRIGGER_SETTLE_MS - 1);
    expect(warn).not.toHaveBeenCalled();
    wait(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
