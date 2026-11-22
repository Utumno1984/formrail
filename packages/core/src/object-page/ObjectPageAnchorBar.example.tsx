import { ObjectPage, ObjectPageHeader, ObjectPageSection } from '@formrail/core';

const sections = [
  { id: 'general', title: 'General' },
  { id: 'details', title: 'Details' },
  { id: 'location', title: 'Location' },
  { id: 'items', title: 'Items' },
];

export function RecordPage() {
  // Every `ObjectPageSection` gets a tab in the anchor bar, from its `title`: a click scrolls to the section,
  // and the tab of the section in view is the selected one while the page scrolls.
  return (
    <div style={{ height: 480 }}>
      <ObjectPage>
        <ObjectPageHeader title="Record REC-00042" subtitle="Ångström Batch" />
        {sections.map((section) => (
          <ObjectPageSection key={section.id} id={section.id} title={section.title}>
            <p style={{ minHeight: 240, margin: 0 }}>Content of the {section.title.toLowerCase()} section.</p>
          </ObjectPageSection>
        ))}
      </ObjectPage>
    </div>
  );
}
