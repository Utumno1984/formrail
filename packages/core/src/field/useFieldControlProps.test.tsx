import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { FieldContext, type FieldControlProps } from './FieldContext';
import { useFieldControlProps } from './useFieldControlProps';

function control(extra: Partial<FieldControlProps> = {}): FieldControlProps {
  return { id: 'field-id', 'aria-labelledby': 'field-label', state: 'default', interactionBlocked: false, ...extra };
}

function run(own: Parameters<typeof useFieldControlProps>[0], field: FieldControlProps | null) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FieldContext.Provider value={field}>{children}</FieldContext.Provider>
  );
  return renderHook(() => useFieldControlProps(own), { wrapper }).result.current;
}

describe('useFieldControlProps', () => {
  it('outside a Field returns the consumer props untouched', () => {
    const own = {
      id: 'mine',
      'aria-labelledby': 'mine-label',
      'aria-describedby': 'mine-help',
      'aria-invalid': true,
      'aria-required': true,
      'aria-readonly': true,
      disabled: true,
      readOnly: true,
    } as const;
    expect(run(own, null)).toEqual(own);
  });

  it('outside a Field with no props yields only undefined values', () => {
    expect(Object.values(run({}, null)).every((v) => v === undefined)).toBe(true);
  });

  it('the Field wins over the consumer for id, labelledby, invalid, required and readonly', () => {
    const result = run(
      { id: 'mine', 'aria-labelledby': 'mine-label', 'aria-invalid': false, 'aria-required': false, 'aria-readonly': false },
      control({ 'aria-invalid': true, 'aria-required': true, 'aria-readonly': true }),
    );
    expect(result.id).toBe('field-id');
    expect(result['aria-labelledby']).toBe('field-label');
    expect(result['aria-invalid']).toBe(true);
    expect(result['aria-required']).toBe(true);
    expect(result['aria-readonly']).toBe(true);
  });

  it('a Field that does not set invalid/required/readonly leaves the consumer value in place', () => {
    const result = run({ 'aria-invalid': true, 'aria-required': true, 'aria-readonly': true }, control());
    expect(result['aria-invalid']).toBe(true);
    expect(result['aria-required']).toBe(true);
    expect(result['aria-readonly']).toBe(true);
  });

  it('merges aria-describedby: the Field ids first, then the consumer', () => {
    expect(run({ 'aria-describedby': 'mine' }, control({ 'aria-describedby': 'f-reason f-error' }))['aria-describedby']).toBe(
      'f-reason f-error mine',
    );
    expect(run({}, control({ 'aria-describedby': 'f-error' }))['aria-describedby']).toBe('f-error');
    expect(run({ 'aria-describedby': 'mine' }, control())['aria-describedby']).toBe('mine');
    expect(run({}, control())['aria-describedby']).toBeUndefined();
  });

  it('the Field can only add disabled/readOnly, never remove the consumer value', () => {
    expect(run({ disabled: true, readOnly: true }, control()).disabled).toBe(true);
    expect(run({ disabled: true, readOnly: true }, control()).readOnly).toBe(true);
    expect(run({}, control({ disabled: true })).disabled).toBe(true);
    expect(run({}, control({ readOnly: true })).readOnly).toBe(true);
  });

  it('state disabled: forwards disabled', () => {
    expect(run({}, control({ disabled: true, state: 'disabled', interactionBlocked: true })).disabled).toBe(true);
  });

  it.each(['forced', 'locked'] as const)('state %s: forwards readOnly and aria-readonly, not disabled', (state) => {
    const result = run({}, control({ readOnly: true, 'aria-readonly': true, state, interactionBlocked: true }));
    expect(result.readOnly).toBe(true);
    expect(result['aria-readonly']).toBe(true);
    expect(result.disabled).toBeUndefined();
  });
});
