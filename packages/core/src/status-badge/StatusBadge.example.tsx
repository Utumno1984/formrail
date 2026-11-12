import { Icon, StatusBadge } from '@formrail/core';

export function InvoiceStatuses() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <StatusBadge tone="neutral">Draft</StatusBadge>
      <StatusBadge tone="info">In review</StatusBadge>
      <StatusBadge tone="success">Approved</StatusBadge>
      {/* The icon is decorative: the status is always carried by the text. */}
      <StatusBadge
        tone="warning"
        icon={
          <Icon size="xs">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1 15 14H1z" />
            </svg>
          </Icon>
        }
      >
        Overdue
      </StatusBadge>
      <StatusBadge tone="error">Rejected</StatusBadge>
    </div>
  );
}
