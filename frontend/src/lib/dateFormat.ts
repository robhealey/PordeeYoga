/** Shared day-first date formatting (dd/mm/yyyy) so dates never render in the US month/day order,
 * regardless of the viewer's browser/OS locale. */

interface TzOpts {
  timeZone?: string;
}

function part(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", opts).format(d);
}

/** "24/09/2026" */
export function formatDate(iso: string | Date, opts: TzOpts = {}): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const day = part(d, { timeZone: opts.timeZone, day: "2-digit" });
  const month = part(d, { timeZone: opts.timeZone, month: "2-digit" });
  const year = part(d, { timeZone: opts.timeZone, year: "numeric" });
  return `${day}/${month}/${year}`;
}

/** "24 Sep 2026" — day first, month spelled out. */
export function formatDateLong(iso: string | Date, opts: TzOpts = {}): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const day = part(d, { timeZone: opts.timeZone, day: "numeric" });
  const month = part(d, { timeZone: opts.timeZone, month: "short" });
  const year = part(d, { timeZone: opts.timeZone, year: "numeric" });
  return `${day} ${month} ${year}`;
}

/** "24/09/2026, 18:00" */
export function formatDateTime(iso: string, opts: TzOpts = {}): string {
  const d = new Date(iso);
  const time = part(d, { timeZone: opts.timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${formatDate(d, opts)}, ${time}`;
}

/** "24 Sep 2026, 6:00 PM", optionally prefixed with the weekday. */
export function formatDateTimeLong(iso: string, opts: TzOpts & { weekday?: "short" | "long" } = {}): string {
  const d = new Date(iso);
  const time = part(d, { timeZone: opts.timeZone, hour: "numeric", minute: "2-digit", hour12: true });
  const weekdayPart = opts.weekday ? `${part(d, { timeZone: opts.timeZone, weekday: opts.weekday })}, ` : "";
  return `${weekdayPart}${formatDateLong(d, opts)}, ${time}`;
}

/** Formats a plain "YYYY-MM-DD" date-only string (e.g. from a date input, or a DB date column with no
 * time component) as "24/09/2026" — by splitting the string rather than going through `Date`, so it can
 * never shift a day when the viewer's timezone differs from UTC. */
export function formatDateOnly(dateOnly: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOnly);
  if (!m) return dateOnly;
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}
