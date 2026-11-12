import { Button, DescriptionList, DescriptionListItem, ObjectPage, ObjectPageHeader, ObjectPageSection, StatusBadge } from '@formrail/core';

export function InvoicePage() {
  // The page fills a parent with a bounded height and scrolls inside itself: the header stays in view and
  // the anchor bar jumps between the sections. In a flex or grid layout, give its cell `min-height: 0`.
  return (
    <div style={{ height: 480 }}>
      <ObjectPage>
        <ObjectPageHeader
          title="Invoice INV-0142"
          subtitle="Rossi Construction"
          status={<StatusBadge tone="warning">To approve</StatusBadge>}
          actions={
            <>
              <Button variant="secondary">Reject</Button>
              <Button variant="primary">Approve</Button>
            </>
          }
        />
        <ObjectPageSection id="general" title="General">
          <DescriptionList>
            <DescriptionListItem label="Customer">Rossi Construction</DescriptionListItem>
            <DescriptionListItem label="Date">2026-03-02</DescriptionListItem>
          </DescriptionList>
        </ObjectPageSection>
        <ObjectPageSection id="amounts" title="Amounts">
          <DescriptionList>
            <DescriptionListItem label="Net">€ 1,025.00</DescriptionListItem>
            <DescriptionListItem label="VAT">€ 225.50</DescriptionListItem>
            <DescriptionListItem label="Total">€ 1,250.50</DescriptionListItem>
          </DescriptionList>
        </ObjectPageSection>
      </ObjectPage>
    </div>
  );
}
