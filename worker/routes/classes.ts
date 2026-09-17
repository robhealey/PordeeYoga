import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { capacityFor, getSessionById, listUpcomingSessions, spotsLeft } from "../lib/db.ts";

const classes = new Hono<AppEnv>();

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

export default classes;
