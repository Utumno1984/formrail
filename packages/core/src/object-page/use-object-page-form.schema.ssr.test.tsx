// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useObjectPageForm } from './use-object-page-form';

it('renders on the server with a schema, empty fieldErrors and formErrors, without touching the DOM', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const schema = z.object({ name: z.string().min(5) }).refine(() => false, { message: 'root' });
  function Demo() {
    const form = useObjectPageForm<{ name: string }>({ baseline: { name: 'ACME' }, schema });
    return (
      <output>
        {Object.keys(form.fieldErrors).length}/{form.formErrors.length}
      </output>
    );
  }
  expect(renderToString(<Demo />)).toMatch(/>0<!-- -->\/<!-- -->0</);
  expect(error).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
