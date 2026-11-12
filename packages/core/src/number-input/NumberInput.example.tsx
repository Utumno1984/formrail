import { useState } from 'react';
import { Field, NumberInput } from '@formrail/core';

export function QuantityInput() {
  const [quantity, setQuantity] = useState<number | undefined>(1);

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <Field label="Quantity" help="Units on the invoice line.">
        <NumberInput value={quantity} onValueChange={setQuantity} min={1} max={100} step={1} />
      </Field>
      <output>{quantity === undefined ? 'No quantity' : `${quantity} units`}</output>
    </div>
  );
}
