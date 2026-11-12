// The tokens are plain CSS custom properties, available once the stylesheet is imported
// (`import '@formrail/core/styles.css'`). Use them in your own CSS or inline styles with `var()`.
// Here: a panel of your own, built only from tokens, so it follows the theme.
export function TokenPanel() {
  return (
    <div
      style={{
        maxWidth: 360,
        padding: 16,
        display: 'grid',
        gap: 8,
        color: 'var(--color-rop-text)',
        background: 'var(--color-rop-surface)',
        border: '1px solid var(--color-rop-border-subtle)',
        borderRadius: 'var(--radius-rop-md)',
        fontFamily: 'var(--font-rop-sans)',
        fontSize: 'var(--text-rop-body)',
        lineHeight: 'var(--text-rop-body--line-height)',
      }}
    >
      <strong style={{ fontSize: 'var(--text-rop-title-sm)', lineHeight: 'var(--text-rop-title-sm--line-height)' }}>
        Invoice INV-2026-00042
      </strong>
      <span style={{ color: 'var(--color-rop-text-muted)' }}>Northwind Components</span>
      <code style={{ fontFamily: 'var(--font-rop-mono)', fontSize: 'var(--text-rop-caption)' }}>EUR 1,240.00</code>
      <span style={{ color: 'var(--color-rop-error)' }}>Payment overdue</span>
      {/* Derived tokens (primary-hover, error-active, ...) are not set by default: do not read them with a
          bare var(). Use the base colours above, or see the "Derived tokens" section of the package README. */}
    </div>
  );
}
