import { useState } from 'react';
import { AppSwitcher, Text, type AppDescriptor } from '@formrail/core';

// The same list as the launcher: what this user may open, already filtered by your own data.
const apps: AppDescriptor[] = [
  { id: 'one', label: 'App one', href: '#app-one' },
  { id: 'two', label: 'App two', href: '#app-two' },
  {
    id: 'three',
    label: 'App three',
    href: '#app-three',
    disabled: true,
    disabledReason: 'Ask an administrator for access',
  },
  { id: 'four', label: 'App four', href: '#app-four' },
];

export function SwitchApps() {
  const [current, setCurrent] = useState('one');
  // With a router, open the app in `onNavigate` (e.g. `navigate(app.href)`): the list has already
  // closed and the focus is back on the trigger. Ctrl/Cmd+click and the middle button still open
  // the real href in a new tab.
  // Here switching only changes the current app, so the example can be tried in place.
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <AppSwitcher apps={apps} currentAppId={current} onNavigate={(app) => setCurrent(app.id)} />
      <Text variant="caption">Current app: {apps.find((app) => app.id === current)?.label}</Text>
    </div>
  );
}
