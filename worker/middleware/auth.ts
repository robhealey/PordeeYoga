import type { Context, Next } from "hono";
import type { AppEnv } from "../types.ts";
import { getUserForToken, readSessionCookie } from "../lib/session.ts";

/** Loads the current user (if any) onto `c.var.user`. Never rejects — routes decide what's required. */
export async function attachUser(c: Context<AppEnv>, next: Next) {
  const token = readSessionCookie(c.req.header("Cookie") ?? null);
  if (token) {
    const user = await getUserForToken(c.env, token);
    c.set("user", user);
  } else {
    c.set("user", null);
  }
  await next();
}

export async function requireUser(c: Context<AppEnv>, next: Next) {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  await next();
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  if (user.role !== "admin") return c.json({ error: "Admin access required" }, 403);
  await next();
}
