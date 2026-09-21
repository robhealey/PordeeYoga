import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { attachUser, requireUser } from "../middleware/auth.ts";
import { createPromptPayCharge, mapOmiseStatus } from "../lib/omise.ts";
import { applyPaymentEffect } from "../lib/payments.ts";

const payments = new Hono<AppEnv>();

payments.use("*", attachUser);

interface Payable {
  amountCents: number;
  currency: string;
  description: string;
}

async function loadPayable(
  c: { env: AppEnv["Bindings"] },
  userId: number,
  body: { memberPackageId?: number }
): Promise<{ payable: Payable; memberPackageId?: number } | { error: string; status: number }> {
  if (body.memberPackageId) {
    const mp = await c.env.DB.prepare(
      `SELECT mp.id, mp.user_id, mp.status, mp.price_paid_cents, mp.currency, p.name AS package_name
       FROM member_packages mp JOIN packages p ON p.id = mp.package_id WHERE mp.id = ?`
    )
      .bind(body.memberPackageId)
      .first<{ id: number; user_id: number; status: string; price_paid_cents: number; currency: string; package_name: string }>();
    if (!mp) return { error: "Package purchase not found", status: 404 };
    if (mp.user_id !== userId) return { error: "Not your package", status: 403 };
    if (mp.status !== "pending_payment") return { error: `Already ${mp.status}`, status: 409 };
    return {
      payable: { amountCents: mp.price_paid_cents, currency: mp.currency, description: `${c.env.STUDIO_NAME}: ${mp.package_name}` },
      memberPackageId: mp.id,
    };
  }
  return { error: "memberPackageId is required", status: 400 };
}

payments.post("/omise/charge", requireUser, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json<{ memberPackageId?: number }>();

  const loaded = await loadPayable(c, user.id, body);
  if ("error" in loaded) return c.json({ error: loaded.error }, loaded.status as 400 | 403 | 404 | 409);
  const { payable, memberPackageId } = loaded;

  const charge = await createPromptPayCharge(c.env, {
    amountSatang: payable.amountCents,
    currency: payable.currency,
    description: payable.description,
  });

  const status = mapOmiseStatus(charge.status);

  const payment = await c.env.DB.prepare(
    `INSERT INTO payments (member_package_id, provider, provider_charge_id, amount_cents, currency, status, updated_at)
     VALUES (?, 'omise', ?, ?, ?, ?, datetime('now')) RETURNING id`
  )
    .bind(memberPackageId ?? null, charge.id, payable.amountCents, payable.currency, status)
    .first<{ id: number }>();

  if (status === "succeeded" && payment) {
    await applyPaymentEffect(c.env, payment.id);
  }

  return c.json({
    chargeId: charge.id,
    status,
    qrImageUri: charge.source?.scannable_code?.image?.download_uri ?? null,
  });
});

export default payments;
