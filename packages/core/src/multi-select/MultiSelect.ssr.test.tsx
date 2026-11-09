// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Field } from '../field/Field';
import { MultiSelect } from './MultiSelect';

const CENTERS = [
  { value: 'mkt', label: 'Marketing' },
  { value: 'sal', label: 'Sales' },
];

describe('MultiSelect on the server', () => {
  it('renders the chips, the hidden inputs and aria-controls to a hidden listbox without touching the DOM', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const html = renderToString(
      <Field label="Cost centers" name="centers">
        <MultiSelect options={CENTERS} defaultValue={['sal', 'mkt']} />
      </Field>,
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-multiselectable="true"');
    expect(html).not.toContain('role="option"');
    expect(html.indexOf('Sales')).toBeLessThan(html.indexOf('Marketing'));
    expect(html).toContain('type="hidden" name="centers" value="sal"');
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
