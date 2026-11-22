import {
  Button,
  DescriptionList,
  DescriptionListItem,
  ObjectPage,
  ObjectPageHeader,
  ObjectPageSection,
  StatusBadge,
} from '@formrail/core';

export function RecordPage() {
  // The page fills a parent with a bounded height and scrolls inside itself: the header stays in view and
  // the anchor bar jumps between the sections. In a flex or grid layout, give its cell `min-height: 0`.
  return (
    <div style={{ height: 480 }}>
      <ObjectPage>
        <ObjectPageHeader
          title="Record REC-00042"
          subtitle="Ångström Batch"
          status={<StatusBadge tone="info">Pending</StatusBadge>}
          actions={
            <>
              <Button variant="secondary">Reject</Button>
              <Button variant="primary">Approve</Button>
            </>
          }
        />
        <ObjectPageSection id="general" title="General">
          <DescriptionList>
            <DescriptionListItem label="Owner">Jürgen Wagner</DescriptionListItem>
            <DescriptionListItem label="Due date">2026-01-18</DescriptionListItem>
          </DescriptionList>
        </ObjectPageSection>
        <ObjectPageSection id="details" title="Details">
          <DescriptionList>
            <DescriptionListItem label="Reference">REF-135716</DescriptionListItem>
            <DescriptionListItem label="Quantity">20</DescriptionListItem>
            <DescriptionListItem label="Amount">€ 8,674.60</DescriptionListItem>
          </DescriptionList>
        </ObjectPageSection>
      </ObjectPage>
    </div>
  );
}
