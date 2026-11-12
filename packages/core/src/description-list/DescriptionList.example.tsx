import { DescriptionList, DescriptionListItem, DescriptionListStatus, StatusBadge } from '@formrail/core';

export function InvoiceSummary() {
  return (
    <section style={{ maxWidth: 560 }}>
      <DescriptionListStatus status={<StatusBadge tone="warning">To approve</StatusBadge>} detail="Waiting for the purchasing office" />
      {/* `auto` (the default): terms beside the values when the list's own container is wide, above them when narrow. */}
      <DescriptionList emptyLabel="Not specified">
        <DescriptionListItem label="Customer">Rossi Construction</DescriptionListItem>
        <DescriptionListItem label="Invoice">INV-0142</DescriptionListItem>
        <DescriptionListItem label="Amount">€ 1,250.50</DescriptionListItem>
        <DescriptionListItem label="PO number">{null}</DescriptionListItem>
      </DescriptionList>
    </section>
  );
}
