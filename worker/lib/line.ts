import type { Env } from "../env.d.ts";

export interface LineProfile {
  lineUserId: string;
  displayName: string;
  pictureUrl: string | null;
  email: string | null;
}

interface LineVerifyResponse {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  name?: string;
  picture?: string;
  email?: string;
}

/** Verify a LIFF `liff.getIDToken()` or OAuth-callback ID token against LINE's verify endpoint. */
export async function verifyLineIdToken(env: Env, idToken: string): Promise<LineProfile> {
  if (!env.LINE_LOGIN_CHANNEL_ID) {
    throw new Error("LINE_LOGIN_CHANNEL_ID is not configured");
  }
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: env.LINE_LOGIN_CHANNEL_ID }),
  });
  if (!res.ok) {
    throw new Error(`LINE ID token verification failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as LineVerifyResponse;
  if (data.aud !== env.LINE_LOGIN_CHANNEL_ID) {
    throw new Error("LINE ID token audience mismatch");
  }
  return {
    lineUserId: data.sub,
    displayName: data.name ?? "LINE User",
    pictureUrl: data.picture ?? null,
    email: data.email ?? null,
  };
}

interface LineTokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
  refresh_token?: string;
}

/** Exchange an OAuth `code` (plain-browser LINE Login redirect flow) for tokens, then verify the ID token. */
export async function exchangeLineLoginCode(
  env: Env,
  code: string,
  redirectUri: string
): Promise<LineProfile> {
  if (!env.LINE_LOGIN_CHANNEL_ID || !env.LINE_LOGIN_CHANNEL_SECRET) {
    throw new Error("LINE Login channel is not configured");
  }
  const res = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: env.LINE_LOGIN_CHANNEL_ID,
      client_secret: env.LINE_LOGIN_CHANNEL_SECRET,
    }),
  });
  if (!res.ok) {
    throw new Error(`LINE token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as LineTokenResponse;
  return verifyLineIdToken(env, data.id_token);
}

/** Verify the `x-line-signature` header on an incoming Messaging API webhook. */
export async function verifyLineWebhookSignature(
  channelSecret: string,
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  if (!signatureHeader) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signatureHeader;
}

/** Push a message to a LINE user (booking confirmations, reminders). No-ops quietly if Messaging isn't configured yet. */
export async function pushLineMessage(env: Env, to: string, text: string): Promise<void> {
  if (!env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN) {
    console.warn("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN not configured; skipping push message");
    return;
  }
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) {
    console.error(`LINE push message failed: ${res.status} ${await res.text()}`);
  }
}
