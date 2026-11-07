import { cn } from '../src/index';

describe('cn', () => {
  it('keeps the last of two conflicting utilities', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('knows the z-index tokens: the last one wins', () => {
    expect(cn('z-rop-modal', 'z-rop-popover')).toBe('z-rop-popover');
    expect(cn('z-rop-tooltip', 'z-rop-sticky')).toBe('z-rop-sticky');
  });

  it('knows the font-family tokens: only the last one stays', () => {
    expect(cn('font-rop-mono', 'font-rop-sans')).toBe('font-rop-sans');
  });

  it('keeps a token font size AND a token text color (they are different groups)', () => {
    expect(cn('text-rop-body', 'text-rop-error')).toBe('text-rop-body text-rop-error');
    expect(cn('text-rop-error', 'text-rop-body')).toBe('text-rop-error text-rop-body');
  });

  it('keeps only the last of two token font sizes, and the last of two token colors', () => {
    expect(cn('text-rop-body', 'text-rop-title-lg')).toBe('text-rop-title-lg');
    expect(cn('text-rop-error', 'text-rop-success')).toBe('text-rop-success');
    expect(cn('bg-rop-surface', 'bg-rop-primary')).toBe('bg-rop-primary');
  });

  it('knows the derived color tokens (their own block in tokens.css): they conflict as any other color', () => {
    expect(cn('bg-rop-primary', 'bg-rop-primary-hover')).toBe('bg-rop-primary-hover');
    expect(cn('bg-rop-primary-hover', 'bg-rop-surface-pressed')).toBe('bg-rop-surface-pressed');
    expect(cn('bg-rop-error-active', 'bg-rop-readonly-surface')).toBe('bg-rop-readonly-surface');
    expect(cn('text-rop-primary-active', 'text-rop-readonly-indicator')).toBe('text-rop-readonly-indicator');
    expect(cn('text-rop-body', 'text-rop-primary-hover')).toBe('text-rop-body text-rop-primary-hover');
  });

  it('does not let a color token conflict with a size token that shares a word', () => {
    // `rop-text-muted` is a color, `rop-title-sm` is a size.
    expect(cn('text-rop-text-muted', 'text-rop-title-sm')).toBe('text-rop-text-muted text-rop-title-sm');
  });

  it('knows the radius tokens', () => {
    expect(cn('rounded-rop-sm', 'rounded-rop-lg')).toBe('rounded-rop-lg');
  });

  it('respects variants: a class without variant does not remove one with a variant', () => {
    expect(cn('hover:px-2', 'hover:px-4')).toBe('hover:px-4');
    expect(cn('md:z-rop-modal', 'z-rop-popover')).toBe('md:z-rop-modal z-rop-popover');
    expect(cn('z-rop-popover', 'md:z-rop-modal')).toBe('z-rop-popover md:z-rop-modal');
  });

  it('arbitrary values and tokens conflict: the last one wins', () => {
    expect(cn('z-[5]', 'z-rop-modal')).toBe('z-rop-modal');
    expect(cn('z-rop-modal', 'z-[5]')).toBe('z-[5]');
  });

  it('accepts undefined, null, false, arrays and conditional objects (clsx)', () => {
    expect(cn('a', undefined, null, false, 'b')).toBe('a b');
    expect(cn(['a', ['b', false]], { c: true, d: false })).toBe('a b c');
    expect(cn()).toBe('');
    expect(cn(undefined, null, false)).toBe('');
    expect(cn('a', undefined)).not.toContain('undefined');
    expect(cn('  a  ', '', 'b')).not.toMatch(/\s{2,}/);
  });
});
