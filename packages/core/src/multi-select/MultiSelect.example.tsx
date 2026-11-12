import { useState } from 'react';
import { Field, MultiSelect, type MultiSelectOption } from '@formrail/core';

const COST_CENTERS: MultiSelectOption[] = [
  { value: 'fin', label: 'Finance' },
  { value: 'mkt', label: 'Marketing' },
  { value: 'sal', label: 'Sales' },
  { value: 'ops', label: 'Operations' },
];

export function CostCentersMultiSelect() {
  const [centers, setCenters] = useState<readonly string[]>(['fin']);

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <Field label="Cost centers" help="Where the invoice is charged.">
        <MultiSelect options={COST_CENTERS} value={centers} onValueChange={setCenters} placeholder="Add a cost center" />
      </Field>
      <output>{centers.length} selected</output>
    </div>
  );
}
