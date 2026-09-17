import type { Env } from "../env.d.ts";

const SESSION_COOKIE = "pordee_session";
const SESSION_DAYS = 30;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(env: Env, userId: number): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)"
  )
    .bind(tokenHash, userId, expiresAt)
    .run();
  return token;
}

export async function destroySession(env: Env, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export interface SessionUser {
  id: number;
  line_user_id: string | null;
  display_name: string;
  picture_url: string | null;
  role: "customer" | "instructor" | "admin";
}

export async function getUserForToken(env: Env, token: string): Promise<SessionUser | null> {
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.line_user_id, u.display_name, u.picture_url, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
  )
    .bind(tokenHash)
    .first<SessionUser>();
  return row ?? null;
}

export function sessionCookieHeader(token: string, secure: boolean): string {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearCookieHeader(secure: boolean): string {
  const attrs = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${SESSION_COOKIE}=`));
  return match ? match.slice(SESSION_COOKIE.length + 1) : null;
}
