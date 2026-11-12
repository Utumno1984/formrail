import { useState } from 'react';
import { Button, Menu, MenuContent, MenuGroup, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@formrail/core';

export function InvoiceActionsMenu() {
  const [last, setLast] = useState('');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 24 }}>
      {/* Closed until the trigger opens it (click, Enter, Space or ArrowDown). Arrow keys move between the items,
          Escape closes it and returns the focus to the trigger. */}
      <Menu>
        <MenuTrigger asChild>
          <Button variant="secondary">More actions</Button>
        </MenuTrigger>
        <MenuContent>
          <MenuGroup>
            <MenuLabel>Edit</MenuLabel>
            <MenuItem onSelect={() => setLast('Rename')}>Rename</MenuItem>
            <MenuItem onSelect={() => setLast('Duplicate')}>Duplicate</MenuItem>
          </MenuGroup>
          <MenuSeparator />
          <MenuGroup>
            <MenuLabel>Danger zone</MenuLabel>
            <MenuItem disabled>Archive</MenuItem>
            <MenuItem tone="danger" onSelect={() => setLast('Delete')}>
              Delete…
            </MenuItem>
          </MenuGroup>
        </MenuContent>
      </Menu>
      <span role="status">{last ? `Chosen: ${last}` : ''}</span>
    </div>
  );
}
