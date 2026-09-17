import type { Env } from "../env.d.ts";

export interface ClassType {
  id: number;
  name: string;
  description: string | null;
  duration_minutes: number;
  capacity: number;
  price_cents: number;
  currency: string;
  active: number;
  min_confirm_count: number;
  min_confirm_value_cents: number | null;
}

export type ClassSessionStatus = "scheduled" | "confirmed" | "full" | "cancelled_by_studio" | "completed";

export interface ClassSessionRow {
  id: number;
  class_type_id: number;
  instructor_id: number | null;
  start_time: string;
  end_time: string;
  min_capacity_override: number | null;
  capacity_override: number | null;
  status: ClassSessionStatus;
  opened_manually: number;
  cancellation_reason: string | null;
  class_name: string;
  price_cents: number;
  currency: string;
  duration_minutes: number;
  class_capacity: number;
  min_confirm_count: number;
  min_confirm_value_cents: number | null;
  instructor_name: string | null;
  booked_count: number;
  booked_value_cents: number;
}

const SESSION_LIST_SELECT = `
  SELECT
    cs.id, cs.class_type_id, cs.instructor_id, cs.start_time, cs.end_time,
    cs.min_capacity_override, cs.capacity_override, cs.status, cs.opened_manually, cs.cancellation_reason,
    ct.name AS class_name, ct.price_cents, ct.currency, ct.duration_minutes,
    ct.capacity AS class_capacity, ct.min_confirm_count, ct.min_confirm_value_cents,
    i.name AS instructor_name,
    (SELECT COUNT(*) FROM bookings b WHERE b.class_session_id = cs.id AND b.status = 'confirmed') AS booked_count,
    (SELECT COALESCE(SUM(b.credit_value_cents), 0) FROM bookings b WHERE b.class_session_id = cs.id AND b.status = 'confirmed') AS booked_value_cents
  FROM class_sessions cs
  JOIN class_types ct ON ct.id = cs.class_type_id
  LEFT JOIN instructors i ON i.id = cs.instructor_id
`;

export async function listUpcomingSessions(env: Env): Promise<ClassSessionRow[]> {
  const { results } = await env.DB.prepare(
    `${SESSION_LIST_SELECT}
     WHERE cs.status != 'cancelled_by_studio' AND cs.start_time > datetime('now')
     ORDER BY cs.start_time ASC`
  ).all<ClassSessionRow>();
  return results;
}

export async function getSessionById(env: Env, id: number): Promise<ClassSessionRow | null> {
  const row = await env.DB.prepare(`${SESSION_LIST_SELECT} WHERE cs.id = ?`).bind(id).first<ClassSessionRow>();
  return row ?? null;
}

export function capacityFor(session: ClassSessionRow): number {
  return session.capacity_override ?? session.class_capacity;
}

export function minCapacityFor(session: ClassSessionRow, defaultMin: number): number {
  return session.min_capacity_override ?? defaultMin;
}

export function spotsLeft(session: ClassSessionRow): number {
  return Math.max(0, capacityFor(session) - session.booked_count);
}

export function isSessionConfirmed(session: ClassSessionRow): boolean {
  return session.status === "confirmed" || session.status === "full";
}

export interface UserRow {
  id: number;
  line_user_id: string | null;
  display_name: string;
  picture_url: string | null;
  phone: string | null;
  date_of_birth: string | null;
  role: "customer" | "instructor" | "admin";
}

export async function upsertLineUser(
  env: Env,
  profile: { lineUserId: string; displayName: string; pictureUrl: string | null }
): Promise<UserRow> {
  const existing = await env.DB.prepare(
    "SELECT id, line_user_id, display_name, picture_url, phone, date_of_birth, role FROM users WHERE line_user_id = ?"
  )
    .bind(profile.lineUserId)
    .first<UserRow>();

  // The designated owner(s)' LINE accounts always re-sync to admin on login, regardless of
  // what the `role` column currently holds — a hardcoded guarantee independent of any
  // in-app role edit (accidental or otherwise).
  const ownerIds = (env.OWNER_LINE_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const isOwner = ownerIds.includes(profile.lineUserId);

  if (existing) {
    const role = isOwner ? "admin" : existing.role;
    await env.DB.prepare("UPDATE users SET display_name = ?, picture_url = ?, role = ? WHERE id = ?")
      .bind(profile.displayName, profile.pictureUrl, role, existing.id)
      .run();
    return { ...existing, display_name: profile.displayName, picture_url: profile.pictureUrl, role };
  }

  const inserted = await env.DB.prepare(
    "INSERT INTO users (line_user_id, display_name, picture_url, role) VALUES (?, ?, ?, ?) RETURNING id, line_user_id, display_name, picture_url, phone, date_of_birth, role"
  )
    .bind(profile.lineUserId, profile.displayName, profile.pictureUrl, isOwner ? "admin" : "customer")
    .first<UserRow>();
  if (!inserted) throw new Error("Failed to create user");
  return inserted;
}
