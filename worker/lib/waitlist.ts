import type { Env } from "../env.d.ts";
import { getSettingNumber } from "./settings.ts";
import { pushLineMessage } from "./line.ts";

export interface WaitlistEntry {
  id: number;
  class_session_id: number;
  user_id: number;
  member_package_id: number | null;
  status: "waiting" | "notified" | "reserved" | "expired" | "cancelled";
  notified_at: string | null;
  notify_expires_at: string | null;
  created_at: string;
}

export async function joinWaitlist(
  env: Env,
  params: { classSessionId: number; userId: number; memberPackageId: number | null }
): Promise<WaitlistEntry | null> {
  const existing = await env.DB.prepare(
    "SELECT 1 FROM waitlist_entries WHERE class_session_id = ? AND user_id = ? AND status IN ('waiting', 'notified')"
  )
    .bind(params.classSessionId, params.userId)
    .first();
  if (existing) return null;

  const row = await env.DB.prepare(
    `INSERT INTO waitlist_entries (class_session_id, user_id, member_package_id, status)
     VALUES (?, ?, ?, 'waiting') RETURNING *`
  )
    .bind(params.classSessionId, params.userId, params.memberPackageId)
    .first<WaitlistEntry>();
  if (!row) throw new Error("Failed to join waitlist");
  return row;
}

export async function listWaitlistForSession(env: Env, classSessionId: number): Promise<WaitlistEntry[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM waitlist_entries WHERE class_session_id = ?
     ORDER BY CASE status WHEN 'waiting' THEN 0 WHEN 'notified' THEN 1 ELSE 2 END, created_at ASC`
  )
    .bind(classSessionId)
    .all<WaitlistEntry>();
  return results;
}

export async function cancelWaitlistEntry(env: Env, id: number, userId: number): Promise<void> {
  await env.DB.prepare(
    "UPDATE waitlist_entries SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status IN ('waiting', 'notified')"
  )
    .bind(id, userId)
    .run();
}

/** Section 11: notify the first WAITING member that a spot opened, giving them a claim window. */
export async function notifyNextWaiting(env: Env, classSessionId: number): Promise<WaitlistEntry | null> {
  const next = await env.DB.prepare(
    `SELECT * FROM waitlist_entries
     WHERE class_session_id = ? AND status = 'waiting'
     ORDER BY created_at ASC LIMIT 1`
  )
    .bind(classSessionId)
    .first<WaitlistEntry>();
  if (!next) return null;

  const claimMinutes = await getSettingNumber(env, "waitlist_claim_minutes");
  const notifiedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + claimMinutes * 60_000).toISOString();

  await env.DB.prepare(
    "UPDATE waitlist_entries SET status = 'notified', notified_at = ?, notify_expires_at = ? WHERE id = ?"
  )
    .bind(notifiedAt, expiresAt, next.id)
    .run();

  const user = await env.DB.prepare("SELECT line_user_id FROM users WHERE id = ?")
    .bind(next.user_id)
    .first<{ line_user_id: string | null }>();
  const session = await env.DB.prepare(
    `SELECT ct.name AS class_name, cs.start_time FROM class_sessions cs
     JOIN class_types ct ON ct.id = cs.class_type_id WHERE cs.id = ?`
  )
    .bind(classSessionId)
    .first<{ class_name: string; start_time: string }>();

  if (user?.line_user_id && session) {
    const when = new Date(session.start_time).toLocaleString("en-US", {
      timeZone: env.TIMEZONE,
      dateStyle: "medium",
      timeStyle: "short",
    });
    await pushLineMessage(
      env,
      user.line_user_id,
      `🎉 A spot opened up in ${session.class_name} on ${when}! You have ${claimMinutes} minutes to claim it in the app before it passes to the next person.`
    );
  }

  return { ...next, status: "notified", notified_at: notifiedAt, notify_expires_at: expiresAt };
}

/** Cron: expire claim windows that passed unclaimed, and cascade the notification to the next person. */
export async function expireStaleNotifications(env: Env): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT id, class_session_id FROM waitlist_entries
     WHERE status = 'notified' AND notify_expires_at < datetime('now')`
  ).all<{ id: number; class_session_id: number }>();

  for (const row of results) {
    await env.DB.prepare("UPDATE waitlist_entries SET status = 'expired' WHERE id = ?").bind(row.id).run();
    await notifyNextWaiting(env, row.class_session_id);
  }
  return results.length;
}

export async function markWaitlistReserved(env: Env, id: number): Promise<void> {
  await env.DB.prepare("UPDATE waitlist_entries SET status = 'reserved' WHERE id = ?").bind(id).run();
}

export async function getWaitlistEntry(env: Env, id: number): Promise<WaitlistEntry | null> {
  const row = await env.DB.prepare("SELECT * FROM waitlist_entries WHERE id = ?").bind(id).first<WaitlistEntry>();
  return row ?? null;
}
