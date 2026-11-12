import { Button, Divider } from '@formrail/core';

export function SeparatedContent() {
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
      <p style={{ margin: 0 }}>First block</p>
      {/* A horizontal separator between two blocks: exposed to assistive technology as `separator`. */}
      <Divider spacing="sm" />
      <p style={{ margin: 0 }}>Second block</p>
      {/* A vertical one between toolbar buttons. `decorative` hides it from assistive technology. */}
      <div style={{ display: 'flex', alignItems: 'center', height: 32 }}>
        <Button variant="ghost">Cut</Button>
        <Divider orientation="vertical" decorative spacing="sm" />
        <Button variant="ghost">Copy</Button>
      </div>
    </div>
  );
}
