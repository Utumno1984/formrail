import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './accordion/Accordion';
import { MultiSelect } from './multi-select/MultiSelect';
import { NumberInput } from './number-input/NumberInput';
import { Pagination } from './pagination/Pagination';

// The computed defaults documented with `@default` in the TSDoc (the source has no literal to compare:
// see `UNCOMPARABLE_ALLOWLIST` in `scripts/default-column-measure.mjs`). Each test shows that omitting
// the prop behaves like passing the documented value.

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

describe('@default of the computed defaults', () => {
  it('NumberInput.step @default 1: ArrowUp adds 1 without the prop, as with step={1}', () => {
    const run = (props: { step?: number }) => {
      const onValueChange = vi.fn();
      const { unmount } = render(<NumberInput aria-label="Quantity" defaultValue={5} onValueChange={onValueChange} {...props} />);
      fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'ArrowUp' });
      unmount();
      return onValueChange.mock.calls;
    };
    expect(run({})).toEqual([[6]]);
    expect(run({})).toEqual(run({ step: 1 }));
  });

  it('Accordion.headingLevel @default 3: the triggers are wrapped in an h3 without the prop', () => {
    const { container } = render(
      <Accordion type="single">
        <AccordionItem value="a">
          <AccordionTrigger>First</AccordionTrigger>
          <AccordionContent>Body</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
    expect(container.querySelectorAll('h2, h4, h5, h6')).toHaveLength(0);
  });

  it('Pagination.siblingCount and boundaryCount @default 1: same buttons as with 1 and 1', () => {
    const names = () => within(screen.getByRole('navigation')).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    const { rerender } = render(<Pagination page={60} pageCount={120} />);
    const omitted = names();
    expect(omitted).toEqual(['Previous page', 'Page 1', 'Page 59', 'Page 60', 'Page 61', 'Page 120', 'Next page']);
    rerender(<Pagination page={60} pageCount={120} siblingCount={1} boundaryCount={1} />);
    expect(names()).toEqual(omitted);
  });

  it('MultiSelect.defaultValue @default []: no chip is selected and the first pick reports only itself', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <MultiSelect
        aria-label="Cost centers"
        options={[
          { value: 'adm', label: 'Administration' },
          { value: 'mkt', label: 'Marketing' },
        ]}
        onValueChange={onValueChange}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    for (const o of options) expect(o).toHaveAttribute('aria-selected', 'false');
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Marketing' }));
    expect(onValueChange).toHaveBeenLastCalledWith(['mkt']);
  });
});
