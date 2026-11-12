import { useState } from 'react';
import { Button, Field, Input, useDirtyGuard } from '@formrail/core';

const saved = 'Rossi Construction';

export function GuardedEditor() {
  const [name, setName] = useState(saved);
  const [left, setLeft] = useState(false);
  // While `when` is true, `guard(action)` asks first; Back/Forward and a reload are intercepted too.
  const { guard, dialog } = useDirtyGuard({ when: name !== saved });

  if (left) return <Button onClick={() => { setName(saved); setLeft(false); }}>Open the supplier again</Button>;
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
      <Field label="Supplier name" name="name">
        <Input value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      {/* Your router's navigation goes inside `guard`: it runs at once when nothing is dirty. */}
      <Button variant="secondary" onClick={() => guard(() => setLeft(true))}>
        Back to list
      </Button>
      {/* The confirmation dialog: render it anywhere in the page. */}
      {dialog}
    </div>
  );
}
