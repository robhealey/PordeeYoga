import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { attachUser, requireUser } from "../middleware/auth.ts";
import { getSessionById, spotsLeft } from "../lib/db.ts";
import { cancelWaitlistEntry, joinWaitlist } from "../lib/waitlist.ts";
import { claimWaitlistSpot } from "../lib/bookings.ts";
import { isUserAuthorizedForMemberPackage } from "../lib/packages.ts";

const waitlist = new Hono<AppEnv>();

waitlist.use("*", attachUser);

waitlist.post("/", requireUser, async (c) => {
  const user = c.get("user")!;
  const { classSessionId, memberPackageId } = await c.req.json<{ classSessionId: number; memberPackageId?: number }>();
  if (!Number.isInteger(classSessionId)) return c.json({ error: "classSessionId is required" }, 400);

  const session = await getSessionById(c.env, classSessionId);
  if (!session || session.status === "cancelled_by_studio") return c.json({ error: "Class not available" }, 404);
  if (spotsLeft(session) > 0) return c.json({ error: "This class still has open spots — book it directly" }, 400);

  if (memberPackageId && !(await isUserAuthorizedForMemberPackage(c.env, memberPackageId, user.id))) {
    return c.json({ error: "You're not authorized to use this package" }, 403);
  }

  const entry = await joinWaitlist(c.env, { classSessionId, userId: user.id, memberPackageId: memberPackageId ?? null });
  if (!entry) return c.json({ error: "You're already on the waitlist for this class" }, 409);
  return c.json({ entry }, 201);
});

waitlist.delete("/:id", requireUser, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid waitlist entry id" }, 400);
  await cancelWaitlistEntry(c.env, id, user.id);
  return c.json({ ok: true });
});

/** Claim a spot after being notified — must supply which package to spend (section 6, 11). */
waitlist.post("/:id/claim", requireUser, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const { memberPackageId } = await c.req.json<{ memberPackageId: number }>();
  if (!Number.isInteger(id) || !Number.isInteger(memberPackageId)) {
    return c.json({ error: "memberPackageId is required" }, 400);
  }
  const result = await claimWaitlistSpot(c.env, { waitlistEntryId: id, userId: user.id, memberPackageId });
  if (!result.ok) return c.json({ error: result.error }, (result.status ?? 400) as 400 | 403 | 404 | 409);
  return c.json({ booking: result.data });
});

waitlist.get("/mine", requireUser, async (c) => {
  const user = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    `SELECT w.*, ct.name AS class_name, cs.start_time
     FROM waitlist_entries w
     JOIN class_sessions cs ON cs.id = w.class_session_id
     JOIN class_types ct ON ct.id = cs.class_type_id
     WHERE w.user_id = ? AND w.status IN ('waiting', 'notified')
     ORDER BY cs.start_time ASC`
  )
    .bind(user.id)
    .all();
  return c.json({ entries: results });
});

export default waitlist;
