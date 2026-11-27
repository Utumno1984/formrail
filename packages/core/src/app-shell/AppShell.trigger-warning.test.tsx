import { act, cleanup, render } from '@testing-library/react';
import { useEffect, useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell, AppShellHeader, AppShellMain, AppShellNav, AppShellNavLink, AppShellNavTrigger } from './AppShell';

// #721: below the breakpoint the navigation column is not displayed and only `AppShellNavTrigger` opens the
// navigation, so a shell with an `AppShellNav` and no trigger leaves it out of reach there. In development a
// warning says so; in production nothing is logged.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const frames = (count = 2) =>
  act(async () => {
    for (let i = 0; i < count; i += 1) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });

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

describe('AppShell: an AppShellNav with no AppShellNavTrigger', () => {
  it('logs one console.warn in development, naming the components, once per shell', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { rerender } = render(<Shell />);
    await frames();
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toMatch(/^\[formrail\] <AppShell> has an <AppShellNav> and no <AppShellNavTrigger>: /);
    expect(message).toContain('64rem');
    rerender(<Shell start={<span>App two</span>} />);
    await frames();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('logs nothing in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<Shell />);
    await frames();
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs nothing with a trigger, nor without a navigation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { unmount } = render(
      <Shell
        start={
          <>
            <AppShellNavTrigger />
            <span>App one</span>
          </>
        }
      />,
    );
    await frames();
    unmount();
    render(<Shell nav={false} />);
    await frames();
    expect(warn).not.toHaveBeenCalled();
  });

  it('a trigger mounted by an effect after the mount counts: nothing is logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    function LateTrigger() {
      const [shown, setShown] = useState(false);
      useEffect(() => setShown(true), []);
      return shown ? <AppShellNavTrigger /> : null;
    }
    render(<Shell start={<LateTrigger />} />);
    await frames();
    expect(warn).not.toHaveBeenCalled();
  });
});
