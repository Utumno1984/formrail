import { Collapsible, CollapsibleContent, CollapsibleTrigger, Input } from '@formrail/core';

export function AdvancedOptions() {
  // Uncontrolled: the section starts closed and keeps its own state. Enter or Space on the trigger
  // toggles it; the trigger carries `aria-expanded`.
  return (
    <div style={{ maxWidth: 520 }}>
      <Collapsible>
        <CollapsibleTrigger>Advanced options</CollapsibleTrigger>
        <CollapsibleContent>
          <Input aria-label="Reference" placeholder="Reference" />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
