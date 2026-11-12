import { useState } from 'react';
import { Combobox, Field, type ComboboxOption } from '@formrail/core';

const CITIES: ComboboxOption[] = [
  { value: 'mil', label: 'Milan' },
  { value: 'rom', label: 'Rome' },
  { value: 'tor', label: 'Turin' },
  { value: 'nap', label: 'Naples' },
  { value: 'bol', label: 'Bologna', disabled: true },
];

export function CityCombobox() {
  const [city, setCity] = useState<string | undefined>('rom');

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <Field label="City" help="Type to filter the list.">
        <Combobox options={CITIES} value={city} onValueChange={setCity} placeholder="Search a city" />
      </Field>
      <output>{city ? `Selected: ${city}` : 'Nothing selected'}</output>
    </div>
  );
}
