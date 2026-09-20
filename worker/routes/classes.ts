import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { attachUser, requireUser } from "../middleware/auth.ts";
import { capacityFor, getSessionById, listUpcomingSessions, spotsLeft } from "../lib/db.ts";

const classes = new Hono<AppEnv>();

classes.use("*", attachUser);

classes.get("/", async (c) => {
  const sessions = await listUpcomingSessions(c.env);
  return c.json({
    sessions: sessions.map((s) => ({
      ...s,
      capacity: capacityFor(s),
      spots_left: spotsLeft(s),
    })),
  });
});

classes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid class id" }, 400);

  const session = await getSessionById(c.env, id);
  if (!session) return c.json({ error: "Not found" }, 404);

  return c.json({
    session: { ...session, capacity: capacityFor(session), spots_left: spotsLeft(session) },
  });
});

/** Who's already booked in — logged-in members only, so anonymous visitors can't harvest names. */
classes.get("/:id/attendees", requireUser, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid class id" }, 400);

  const me = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    `SELECT u.id AS user_id, u.display_name, b.member_package_id, mp.note
     FROM bookings b JOIN users u ON u.id = b.user_id
     LEFT JOIN member_packages mp ON mp.id = b.member_package_id
     WHERE b.class_session_id = ? AND b.status = 'confirmed' ORDER BY b.created_at ASC`
  )
    .bind(id)
    .all<{ user_id: number; display_name: string; member_package_id: number | null; note: string | null }>();
  return c.json({
    attendees: results.map((r) => ({
      name: r.display_name,
      note: r.note,
      mine: r.user_id === me.id,
      memberPackageId: r.user_id === me.id ? r.member_package_id : null,
    })),
  });
});

export default classes;
