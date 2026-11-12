import { useState } from 'react';
import { Button, Skeleton, Text, Title } from '@formrail/core';

export function InvoiceSummary() {
  const [loaded, setLoaded] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 12, width: 360, maxWidth: '100%' }}>
      {/* The container carries the loading state (`aria-busy`); the skeletons are hidden from assistive
          technology. Its height is fixed, so nothing moves when the content replaces the placeholders. */}
      <section
        aria-label="Invoice summary"
        aria-busy={!loaded}
        style={{ boxSizing: 'border-box', height: 132, padding: 16, display: 'grid', alignContent: 'start', gap: 8, border: '1px solid var(--color-rop-border)', borderRadius: 8 }}
      >
        {loaded ? (
          <>
            <Title level={3}>Invoice 2026-0042</Title>
            <Text>Paid on 12 March by Acme Corp.</Text>
            <Text variant="caption">Last updated 2 minutes ago</Text>
          </>
        ) : (
          <>
            <Skeleton textVariant="title-sm" width="60%" />
            <Skeleton textVariant="body" />
            <Skeleton textVariant="caption" width="40%" />
          </>
        )}
      </section>
      <div>
        <Button variant="secondary" disabled={loaded} onClick={() => setLoaded(true)}>
          Load
        </Button>
      </div>
    </div>
  );
}
