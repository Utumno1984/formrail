import { useState } from 'react';
import { Field, RadioGroup, RadioGroupItem } from '@formrail/core';

export function PlanRadioGroup() {
  const [plan, setPlan] = useState<string | null>('monthly');

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <Field label="Plan" help="You can change it later.">
        <RadioGroup value={plan} onValueChange={setPlan}>
          <RadioGroupItem value="monthly">Monthly</RadioGroupItem>
          <RadioGroupItem value="quarterly">Quarterly</RadioGroupItem>
          <RadioGroupItem value="yearly">Yearly</RadioGroupItem>
        </RadioGroup>
      </Field>
      <output>Plan: {plan}</output>
    </div>
  );
}
