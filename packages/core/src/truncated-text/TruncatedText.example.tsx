import { Button, TruncatedText } from '@formrail/core';

export function SupplierRow() {
  // The text takes its width from its parent: in a flex row it shrinks (instead of pushing the row wider),
  // ends with an ellipsis, and shows the full text in a tooltip on hover or focus, only when it is cut.
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 280 }}>
      <TruncatedText>Gialli International Transport and Logistics Ltd - North-West Division</TruncatedText>
      <Button size="sm">Open</Button>
    </div>
  );
}
