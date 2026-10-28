export function QueueWaitEstimate({
  peopleAhead,
  estimatedWaitMinutes,
}: {
  peopleAhead?: number | undefined;
  estimatedWaitMinutes?: number | null | undefined;
}) {
  if (estimatedWaitMinutes === undefined || estimatedWaitMinutes === null) {
    return <span className="text-xs text-muted-foreground">Estimated wait unavailable</span>;
  }

  return (
    <span className="text-xs text-muted-foreground">
      Approx. {estimatedWaitMinutes} min · {peopleAhead ?? 0} ahead
    </span>
  );
}
