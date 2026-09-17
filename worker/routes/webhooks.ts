import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { verifyLineWebhookSignature } from "../lib/line.ts";
import { fetchAuthoritativeCharge, mapOmiseStatus } from "../lib/omise.ts";
import { applyPaymentEffect } from "../lib/payments.ts";

const webhooks = new Hono<AppEnv>();

/**
 * LINE Messaging API webhook. We don't run a chatbot flow for v1 — this just verifies
 * the signature and acknowledges events so the channel stays healthy in the console.
 */
webhooks.post("/line", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-line-signature");
  const channelSecret = c.env.LINE_MESSAGING_CHANNEL_SECRET;

  if (!channelSecret) return c.json({ error: "Messaging channel not configured" }, 503);
  const valid = await verifyLineWebhookSignature(channelSecret, rawBody, signature ?? null);
  if (!valid) return c.json({ error: "Invalid signature" }, 401);

  return c.json({ ok: true });
});

/**
 * Omise webhook. Omise does not sign webhook payloads, so we treat the body only as a
 * pointer to a charge id and re-fetch the authoritative status directly from Omise's API
 * before ever touching a booking or payment row.
 */
webhooks.post("/omise", async (c) => {
  const payload = await c.req.json<{ key?: string; data?: { id?: string } }>().catch(() => null);
  const chargeId = payload?.data?.id;
  if (!chargeId) return c.json({ error: "No charge id in payload" }, 400);

  const charge = await fetchAuthoritativeCharge(c.env, chargeId);
  const status = mapOmiseStatus(charge.status);

  const payment = await c.env.DB.prepare("SELECT id, status FROM payments WHERE provider_charge_id = ?")
    .bind(chargeId)
    .first<{ id: number; status: string }>();
  if (!payment) return c.json({ error: "Unknown charge" }, 404);

  if (payment.status !== status) {
    await c.env.DB.prepare("UPDATE payments SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(status, payment.id)
      .run();
  }

  if (status === "succeeded") {
    await applyPaymentEffect(c.env, payment.id);
  }

  return c.json({ ok: true });
});

export default webhooks;
