import { Button, Tooltip, TooltipProvider } from '@formrail/core';

export function DeleteRowButton() {
  // The provider is optional (a Tooltip supplies its own); share one near the root so the tooltips of an app
  // share their open delay. The tooltip opens on hover or keyboard focus of the trigger, and Escape closes it.
  return (
    <TooltipProvider>
      <div style={{ padding: 48 }}>
        <Tooltip content="Delete the selected row" side="top">
          <Button variant="secondary">Delete</Button>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
