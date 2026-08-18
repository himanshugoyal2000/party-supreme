const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.345],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY],
];

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return "never";

  const then = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(then.getTime())) return "unknown";

  let delta = (then.getTime() - Date.now()) / 1000;
  for (const [unit, step] of UNITS) {
    if (Math.abs(delta) < step) return relative.format(Math.round(delta), unit);
    delta /= step;
  }
  return relative.format(Math.round(delta), "year");
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function formatDuration(seconds: string | number | null | undefined): string {
  const total = typeof seconds === "string" ? Number.parseFloat(seconds) : seconds;
  if (total == null || !Number.isFinite(total)) return "—";

  const whole = Math.round(total);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

/** Heartbeat lands every 30s, so anything older than three minutes means trouble. */
export function isHeartbeatStale(value: string | null | undefined): boolean {
  if (!value) return true;
  const then = new Date(value).getTime();
  return !Number.isFinite(then) || Date.now() - then > 3 * 60 * 1000;
}
