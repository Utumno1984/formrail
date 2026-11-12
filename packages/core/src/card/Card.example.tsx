import { useState } from 'react';
import { Button, Card, CardBody, CardDescription, CardFooter, CardHeader, CardTitle } from '@formrail/core';

export function InvoiceCard() {
  const [approved, setApproved] = useState(false);
  return (
    <div style={{ width: 360, maxWidth: '100%' }}>
      {/* `as="section"` makes the card a region named by its title. */}
      <Card as="section">
        <CardHeader>
          <CardTitle level={3}>Invoice 2026-0142</CardTitle>
          <CardDescription>Acme S.r.l. - due on 30 November</CardDescription>
        </CardHeader>
        <CardBody>{approved ? 'Approved.' : 'Waiting for approval.'}</CardBody>
        <CardFooter>
          <Button variant="primary" onClick={() => setApproved((value) => !value)}>
            {approved ? 'Undo approval' : 'Approve'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
