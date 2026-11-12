import { useState } from 'react';
import { Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@formrail/core';

export function InvoiceTabs() {
  // Controlled: the page owns the selected tab. Arrow keys move between the tabs, Home and End jump to the
  // first and last one, and the matching panel is shown.
  const [tab, setTab] = useState('overview');
  return (
    <div style={{ maxWidth: 560 }}>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Invoice sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" style={{ padding: 16 }}>
          <Input aria-label="Reference" placeholder="Reference" />
        </TabsContent>
        <TabsContent value="details" style={{ padding: 16 }}>
          <p style={{ margin: 0 }}>Details panel</p>
        </TabsContent>
        <TabsContent value="history" style={{ padding: 16 }}>
          <p style={{ margin: 0 }}>History panel</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
