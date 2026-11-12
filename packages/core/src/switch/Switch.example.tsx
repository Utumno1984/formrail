import { useState } from 'react';
import { Field, Switch } from '@formrail/core';

export function NotificationsSwitch() {
  const [enabled, setEnabled] = useState(true);

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <Field label="Notifications" help="Applied immediately.">
        <Switch checked={enabled} onCheckedChange={setEnabled}>
          Email me about new invoices
        </Switch>
      </Field>
      <output>{enabled ? 'On' : 'Off'}</output>
    </div>
  );
}
