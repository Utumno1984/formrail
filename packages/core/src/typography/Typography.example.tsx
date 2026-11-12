import { Input, Text, Title } from '@formrail/core';

export function InvoiceHeading() {
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 360 }}>
      {/* `level` is the semantics (h1..h6), `size` is the look (sm, md, lg): they are independent. */}
      <Title level={1} size="md">
        Invoice approvals
      </Title>
      <Title level={2} size="sm">
        Open invoices
      </Title>

      {/* Text variants: body (default), caption, label. `mono` only switches to the monospace family,
          for identifiers: it keeps the size of the variant. */}
      <Text>Review and approve the supplier invoices waiting for you.</Text>
      <Text variant="caption" mono>
        INV-2026-00042
      </Text>

      {/* `as="label"` renders a real <label>: clicking it focuses the field. */}
      <Text as="label" variant="label" htmlFor="supplier-code">
        Supplier code
      </Text>
      <Input id="supplier-code" />
    </div>
  );
}
