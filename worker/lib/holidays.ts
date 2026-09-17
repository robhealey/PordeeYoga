import type { Env } from "../env.d.ts";

export interface Holiday {
  id: number;
  date: string; // YYYY-MM-DD
  name: string;
  type: "public" | "special";
}

/** Weekday index per `Date#getDay` in the studio's timezone: 0 = Sunday, 6 = Saturday. */
function dayOfWeekInTz(isoDateTime: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(
    new Date(isoDateTime)
  );
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[parts];
}

export function dateOnlyInTz(isoDateTime: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(isoDateTime)
  );
}

/** Is this class-session start time a Saturday, Sunday, or a calendar holiday? (section 8) */
export async function isWeekendOrHoliday(env: Env, isoDateTime: string): Promise<boolean> {
  const dow = dayOfWeekInTz(isoDateTime, env.TIMEZONE);
  if (dow === 0 || dow === 6) return true;
  const dateOnly = dateOnlyInTz(isoDateTime, env.TIMEZONE);
  const holiday = await env.DB.prepare("SELECT 1 FROM holidays WHERE date = ?").bind(dateOnly).first();
  return holiday != null;
}

export async function listHolidays(env: Env): Promise<Holiday[]> {
  const { results } = await env.DB.prepare("SELECT * FROM holidays ORDER BY date ASC").all<Holiday>();
  return results;
}

export async function addHoliday(env: Env, date: string, name: string, type: "public" | "special"): Promise<Holiday> {
  const row = await env.DB.prepare(
    "INSERT INTO holidays (date, name, type) VALUES (?, ?, ?) RETURNING *"
  )
    .bind(date, name, type)
    .first<Holiday>();
  if (!row) throw new Error("Failed to create holiday");
  return row;
}

export async function updateHoliday(
  env: Env,
  id: number,
  fields: { date?: string; name?: string; type?: "public" | "special" }
): Promise<Holiday | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (fields.date !== undefined) {
    sets.push("date = ?");
    values.push(fields.date);
  }
  if (fields.name !== undefined) {
    sets.push("name = ?");
    values.push(fields.name);
  }
  if (fields.type !== undefined) {
    sets.push("type = ?");
    values.push(fields.type);
  }
  if (sets.length === 0) return getHoliday(env, id);
  values.push(id);
  const row = await env.DB.prepare(`UPDATE holidays SET ${sets.join(", ")} WHERE id = ? RETURNING *`)
    .bind(...values)
    .first<Holiday>();
  return row ?? null;
}

export async function getHoliday(env: Env, id: number): Promise<Holiday | null> {
  const row = await env.DB.prepare("SELECT * FROM holidays WHERE id = ?").bind(id).first<Holiday>();
  return row ?? null;
}

export async function removeHoliday(env: Env, id: number): Promise<void> {
  await env.DB.prepare("DELETE FROM holidays WHERE id = ?").bind(id).run();
}
