const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * The two largest non-zero units of a duration, coarsest first.
 *
 * @param ms - negative reads as "now"
 * @returns "2d 4h", "1h 12m", "47m", or "now" under a minute
 */
export function shortDuration(ms: number): string {
  if (ms < MINUTE_MS) return "now";
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}
