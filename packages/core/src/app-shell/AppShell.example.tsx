import { useState } from 'react';
import {
  AppShell,
  AppShellHeader,
  AppShellMain,
  AppShellNav,
  AppShellNavLink,
  Avatar,
  Text,
  Title,
  TruncatedText,
} from '@formrail/core';

const sections = [
  { id: 'a', label: 'Section A' },
  { id: 'b', label: 'Section B' },
  { id: 'c', label: 'Section C' },
];

export function AppFrame() {
  const [current, setCurrent] = useState('a');
  // `fill="parent"` because the example lives in a box of the docs page: the shell of a real app is the
  // whole page (the default, `100dvh`). Header and navigation stay where they are; only the content scrolls.
  // With a router, navigate in `onNavigate` (e.g. `navigate(href)`): a plain click or Enter lands there,
  // while Ctrl/Cmd+click still opens the real href in a new tab. Or render your router's link with `asChild`.
  return (
    <div style={{ height: 360, border: '1px solid var(--color-rop-border)' }}>
      <AppShell fill="parent">
        <AppShellHeader
          start={<TruncatedText style={{ fontWeight: 600 }}>App one</TruncatedText>}
          end={<Avatar name="User one" size="sm" />}
        />
        <AppShellNav>
          {sections.map((section) => (
            <AppShellNavLink
              key={section.id}
              href={`#${section.id}`}
              active={section.id === current}
              onNavigate={() => setCurrent(section.id)}
            >
              {section.label}
            </AppShellNavLink>
          ))}
        </AppShellNav>
        <AppShellMain>
          <div style={{ padding: 16 }}>
            <Title level={1} size="md">
              {sections.find((section) => section.id === current)?.label}
            </Title>
            <Text>The content of the current section scrolls here, below the header.</Text>
          </div>
        </AppShellMain>
      </AppShell>
    </div>
  );
}
