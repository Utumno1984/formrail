import { useState } from 'react';
import { Field, Select, type SelectOption } from '@formrail/core';

const COUNTRIES: SelectOption[] = [
  { value: 'it', label: 'Italy' },
  { value: 'fr', label: 'France' },
  { value: 'de', label: 'Germany', disabled: true },
  { value: 'es', label: 'Spain' },
];

export function CountrySelect() {
  const [country, setCountry] = useState<string | undefined>('it');

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <Field label="Country" help="Supplier registered office.">
        <Select options={COUNTRIES} value={country} onValueChange={setCountry} placeholder="Pick a country" />
      </Field>
      <output>{country ? `Selected: ${country}` : 'Nothing selected'}</output>
    </div>
  );
}
