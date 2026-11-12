import { Button, Icon, Text } from '@formrail/core';

// Icon takes exactly one <svg>: your own, or one from any icon set. It sets the size (xs, sm, md, lg, xl) and
// the colour (the SVG must draw with `currentColor`), whatever width/height the SVG has.
const warning = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3 2 21h20L12 3Z" />
    <path d="M12 10v5M12 18h.01" />
  </svg>
);

const download = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
  </svg>
);

export function InvoiceIcons() {
  return (
    <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
      {/* With a `label` the icon is an image with that name: use it when the icon alone carries the meaning. */}
      <Icon size="lg" label="Payment overdue" style={{ color: 'var(--color-rop-error)' }}>
        {warning}
      </Icon>

      {/* Without a `label` it is decorative (aria-hidden): the text next to it already says everything. */}
      <Text as="span">
        <Icon size="sm" style={{ color: 'var(--color-rop-error)' }}>
          {warning}
        </Icon>{' '}
        Payment overdue
      </Text>

      {/* The button's text names the action, so the icon stays decorative. */}
      <Button variant="secondary">
        <Icon size="sm">{download}</Icon>
        Download PDF
      </Button>
    </div>
  );
}
