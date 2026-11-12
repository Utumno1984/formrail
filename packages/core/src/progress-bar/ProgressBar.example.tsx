import { useEffect, useRef, useState } from 'react';
import { Button, ProgressBar } from '@formrail/core';

export function UploadProgress() {
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);
  const start = () => {
    clearInterval(timer.current);
    let current = 0;
    setProgress(0);
    timer.current = setInterval(() => {
      current = Math.min(100, current + 20);
      setProgress(current);
      if (current === 100) clearInterval(timer.current);
    }, 300);
  };
  return (
    <div style={{ display: 'grid', gap: 12, width: 360, maxWidth: '100%' }}>
      {/* `label` is the bar's accessible name. The bar is not a live region: announce completion yourself
          (here, the status line below). */}
      <ProgressBar label="Uploading invoices" value={progress} tone={progress === 100 ? 'success' : 'primary'} />
      <div>
        <Button variant="secondary" onClick={start}>
          Start upload
        </Button>
      </div>
      <span role="status">{progress === 100 ? 'Upload complete' : ''}</span>
    </div>
  );
}
