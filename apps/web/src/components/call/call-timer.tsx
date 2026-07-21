'use client';

import { useEffect, useState } from 'react';

interface CallTimerProps {
  startTs: number;
  className?: string;
}

export function CallTimer({ startTs, className }: CallTimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - startTs) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTs]);

  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');

  return <span className={className}>{mins}:{secs}</span>;
}
