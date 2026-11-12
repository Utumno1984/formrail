import { useEffect, useRef, useState } from 'react';
import { Button, Spinner } from '@formrail/core';

export function RefreshPanel() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<string[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const refresh = () => {
    clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(() => {
      setRows(['Invoice 1001', 'Invoice 1002']);
      setLoading(false);
    }, 600);
  };
  return (
    <div style={{ display: 'grid', gap: 12, width: 320, maxWidth: '100%' }}>
      <div>
        <Button variant="secondary" onClick={refresh}>
          Refresh
        </Button>
      </div>
      {/* The spinner announces "Loading" in its own status region and rotates only when the user has
          not asked for reduced motion. The panel keeps its height whatever it shows. */}
      <div aria-busy={loading} style={{ minHeight: 56, padding: 12, border: '1px solid var(--color-rop-border-subtle)', borderRadius: 8 }}>
        {loading ? <Spinner /> : null}
        {!loading && rows ? (
          <ul style={{ margin: 0, paddingInlineStart: 20 }}>
            {rows.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        ) : null}
        {!loading && !rows ? 'No data yet' : null}
      </div>
    </div>
  );
}
