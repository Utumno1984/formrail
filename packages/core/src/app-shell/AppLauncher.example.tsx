import { useState } from 'react';
import { AppLauncher, Text, type AppDescriptor } from '@formrail/core';

// The list comes from your own data (what this user may see): the launcher only shows it.
// A disabled app stays in the grid with the reason, so the user knows it exists and why it is closed.
const apps: AppDescriptor[] = [
  { id: 'one', label: 'App one', description: 'What the first app is for', href: '#app-one' },
  { id: 'two', label: 'App two', description: 'What the second app is for', href: '#app-two' },
  {
    id: 'three',
    label: 'App three',
    href: '#app-three',
    disabled: true,
    disabledReason: 'Ask an administrator for access',
  },
  { id: 'four', label: 'App four', description: 'What the fourth app is for', href: '#app-four' },
];

export function ChooseAnApp() {
  const [current, setCurrent] = useState('one');
  // With a router, open the app in `onNavigate` (e.g. `navigate(app.href)`): a plain click or Enter
  // lands here, while Ctrl/Cmd+click and the middle button still open the real href in a new tab.
  // Here opening an app only marks it as the current one, so the example can be tried in place.
  return (
    <div>
      <AppLauncher apps={apps} currentAppId={current} onNavigate={(app) => setCurrent(app.id)} />
      <Text variant="caption">Current app: {apps.find((app) => app.id === current)?.label}</Text>
    </div>
  );
}
