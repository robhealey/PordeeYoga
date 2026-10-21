import type { Env } from "../env.d.ts";
import { pushLineMessage } from "./line.ts";
import { formatDateTimeForMessage } from "./dateFormat.ts";

/** LINE-messages the instructor assigned to a class, if they're linked to a LINE account.
 * `build` gets the class name and a formatted start time. */
export async function notifyAssignedInstructor(
  env: Env,
  classSessionId: number,
  build: (className: string, when: string, bookedCount: number) => string
): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT u.line_user_id, ct.name AS class_name, cs.start_time,
            (SELECT COUNT(*) FROM bookings b WHERE b.class_session_id = cs.id AND b.status = 'confirmed') AS booked_count
     FROM class_sessions cs
     JOIN class_types ct ON ct.id = cs.class_type_id
     JOIN instructors i ON i.id = cs.instructor_id
     JOIN users u ON u.id = i.user_id
     WHERE cs.id = ?`
  )
    .bind(classSessionId)
    .first<{ line_user_id: string | null; class_name: string; start_time: string; booked_count: number }>();
  if (!row?.line_user_id) return;
  const when = formatDateTimeForMessage(row.start_time, env.TIMEZONE);
  await pushLineMessage(env, row.line_user_id, build(row.class_name, when, row.booked_count));
}

export const classConfirmedMessage = (className: string, when: string, bookedCount: number) =>
  `✅ Your class is confirmed: ${className} on ${when} (${bookedCount} booked so far).`;
