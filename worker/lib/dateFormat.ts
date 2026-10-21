/** Shared day-first date formatting for outgoing LINE messages, so times never render in the US month/day order. */

function part(d: Date, timeZone: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).format(d);
}

/** "24 Sep 2026, 6:00 PM" */
export function formatDateTimeForMessage(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const day = part(d, timeZone, { day: "numeric" });
  const month = part(d, timeZone, { month: "short" });
  const year = part(d, timeZone, { year: "numeric" });
  const time = part(d, timeZone, { hour: "numeric", minute: "2-digit", hour12: true });
  return `${day} ${month} ${year}, ${time}`;
}

/** "30 Nov 2026" from a plain YYYY-MM-DD date (no timezone shift). */
export function formatDateForMessage(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const month = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" }).format(new Date(Date.UTC(y, m - 1, d)));
  return `${d} ${month} ${y}`;
}
