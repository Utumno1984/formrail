import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppLauncher, type AppLauncherProps } from './AppLauncher';
import type { AppDescriptor } from './types';

// The markup of `AppLauncher` without extra groups, frozen by the snapshot file: it was written before the extra
// groups existed (#654), so any change of the markup of a launcher that does not use them fails here.

const APPS: AppDescriptor[] = [
  { id: 'one', label: 'App one', description: 'First app', href: '/one', icon: <svg viewBox="0 0 16 16" /> },
  { id: 'two', label: 'App two', href: '/two' },
  { id: 'three', label: 'App three', description: 'Third app', href: '/three', disabled: true, disabledReason: 'Not enabled for you' },
  { id: 'four', label: 'App four' },
];

const CASES: [string, AppLauncherProps][] = [
  ['apps, current, disabled, button', { apps: APPS, currentAppId: 'two', onNavigate: () => {} }],
  ['loading', { apps: APPS, loading: true }],
  ['empty', { apps: [] }],
  ['labels and attributes', { apps: APPS.slice(0, 2), labels: { region: 'Applications' }, className: 'p-6', id: 'launcher' }],
];

describe('AppLauncher: markup without extra groups', () => {
  it.each(CASES)('%s: unchanged', (_, props) => {
    expect(renderToStaticMarkup(<AppLauncher {...props} />)).toMatchSnapshot();
  });
});
