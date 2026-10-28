import { useEffect, useState } from "react";

export function QueueWaitTime({
  checkedInAt,
  endedAt,
}: {
  checkedInAt?: string | undefined;
  endedAt?: string | undefined;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endedAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, [endedAt]);

  if (!checkedInAt) return null;
  const start = Date.parse(checkedInAt);
  if (Number.isNaN(start)) {
    return <span className="text-xs text-muted-foreground">Wait time unavailable</span>;
  }

  const end = endedAt ? Date.parse(endedAt) : now;
  const elapsedMinutes = Number.isNaN(end) ? 0 : Math.max(0, Math.floor((end - start) / 60_000));
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  const duration = hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;

  return (
    <span className="text-xs text-muted-foreground" aria-live="off">
      {endedAt ? "Waited" : "Waiting"} {duration}
    </span>
  );
}
