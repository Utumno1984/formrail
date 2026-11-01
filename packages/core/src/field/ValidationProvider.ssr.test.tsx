// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { Input } from '../input/Input';
import { Field } from './Field';
import { ValidationProvider } from './ValidationContext';

it('renders on the server: the provider error is in the markup, no warning', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const html = renderToString(
    <ValidationProvider fieldErrors={{ supplier: 'Supplier is required' }}>
      <Field label="Supplier" name="supplier">
        <Input />
      </Field>
    </ValidationProvider>,
  );
  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain('Supplier is required');
  expect(html).toMatch(/aria-describedby="[^"]*-error"/);
  expect(error).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
