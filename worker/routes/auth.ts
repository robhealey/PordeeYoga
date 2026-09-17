import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { exchangeLineLoginCode, verifyLineIdToken } from "../lib/line.ts";
import { upsertLineUser } from "../lib/db.ts";
import { attachUser } from "../middleware/auth.ts";
import {
  clearCookieHeader,
  createSession,
  destroySession,
  readSessionCookie,
  sessionCookieHeader,
} from "../lib/session.ts";

const auth = new Hono<AppEnv>();

function isSecure(c: { env: AppEnv["Bindings"] }) {
  return c.env.ENVIRONMENT === "production";
}

/** Called by the LIFF frontend after `liff.login()`, with the LIFF ID token. */
auth.post("/liff/verify", async (c) => {
  const { idToken } = await c.req.json<{ idToken: string }>();
  if (!idToken) return c.json({ error: "idToken is required" }, 400);

  const profile = await verifyLineIdToken(c.env, idToken);
  const user = await upsertLineUser(c.env, profile);
  const token = await createSession(c.env, user.id);

  c.header("Set-Cookie", sessionCookieHeader(token, isSecure(c)));
  return c.json({ user });
});

/** Plain-browser LINE Login OAuth redirect callback: `?code=...&state=...`. */
auth.post("/line/callback", async (c) => {
  const { code, redirectUri } = await c.req.json<{ code: string; redirectUri: string }>();
  if (!code || !redirectUri) return c.json({ error: "code and redirectUri are required" }, 400);

  const profile = await exchangeLineLoginCode(c.env, code, redirectUri);
  const user = await upsertLineUser(c.env, profile);
  const token = await createSession(c.env, user.id);

  c.header("Set-Cookie", sessionCookieHeader(token, isSecure(c)));
  return c.json({ user });
});

/** Dev-only: mock a logged-in LINE user without real LINE credentials, gated by DEV_MOCK_AUTH. */
auth.post("/dev-mock-login", async (c) => {
  if (c.env.DEV_MOCK_AUTH !== "true") {
    return c.json({ error: "Mock auth is disabled" }, 403);
  }
  type MockLoginBody = { displayName?: string; role?: "customer" | "admin" };
  const body = await c.req
    .json<MockLoginBody>()
    .catch((): MockLoginBody => ({}));
  const displayName = body.displayName ?? "Dev Tester";
  const mockLineId = `dev-mock-${displayName.toLowerCase().replace(/\s+/g, "-")}`;

  const user = await upsertLineUser(c.env, {
    lineUserId: mockLineId,
    displayName,
    pictureUrl: null,
  });

  if (body.role === "admin" && user.role !== "admin") {
    await c.env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(user.id).run();
    user.role = "admin";
  }

  const token = await createSession(c.env, user.id);
  c.header("Set-Cookie", sessionCookieHeader(token, isSecure(c)));
  return c.json({ user });
});

auth.post("/logout", async (c) => {
  const token = readSessionCookie(c.req.header("Cookie") ?? null);
  if (token) await destroySession(c.env, token);
  c.header("Set-Cookie", clearCookieHeader(isSecure(c)));
  return c.json({ ok: true });
});

auth.get("/me", attachUser, async (c) => {
  return c.json({ user: c.get("user") });
});

export default auth;
