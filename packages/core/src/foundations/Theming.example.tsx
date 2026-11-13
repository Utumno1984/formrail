import type { CSSProperties } from 'react';
import { Button, Field, Input, StatusBadge } from '@formrail/core';

// There is no theme provider: theming is plain CSS. Redeclare the custom properties of the stylesheet on any
// element and everything inside follows. In an app this is usually a class in your CSS:
//
//   .violet-theme {
//     --color-rop-primary: #6b3fa0;
//     --color-rop-primary-contrast: #ffffff;
//     --color-rop-info: #6b3fa0;
//     --radius-rop-md: 1rem;
//   }
//
// With a light primary (a yellow, a pale green) the white text of a primary Button becomes unreadable:
// redeclare --color-rop-primary-contrast as well, with a dark colour. Redeclare the base colours only: hover,
// pressed and read-only shades are computed from them. Menus, dialogs and other portaled content render outside the
// wrapper, so they take the theme of :root.
const violetTheme = {
  '--color-rop-primary': '#6b3fa0',
  '--color-rop-primary-contrast': '#ffffff',
  '--color-rop-info': '#6b3fa0',
  '--radius-rop-md': '1rem',
} as CSSProperties;

export function ThemedSection() {
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 360 }}>
      <div style={{ ...violetTheme, display: 'grid', gap: 12 }}>
        <Field label="Supplier" help="Themed: radius and primary colour follow the wrapper.">
          <Input defaultValue="Northwind Components" />
        </Field>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Button variant="primary">Approve</Button>
          <StatusBadge tone="info">Pending</StatusBadge>
        </div>
      </div>

      {/* Outside the wrapper: the default theme. */}
      <Button variant="primary">Approve (default theme)</Button>
    </div>
  );
}
