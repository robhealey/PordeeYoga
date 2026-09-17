import type { Env } from "../env.d.ts";
import { activateMemberPackage } from "./packages.ts";
import { applyExtendRenewal } from "./renewals.ts";
import { pushLineMessage } from "./line.ts";

interface PaymentRow {
  id: number;
  member_package_id: number | null;
  package_renewal_id: number | null;
}

/** Applies the effect of a payment once its status is `succeeded`: activates the package it
 * paid for, or applies the renewal fee it paid for. Idempotent (activate/apply are themselves
 * idempotent), safe to call from both the synchronous charge response and the async webhook. */
export async function applyPaymentEffect(env: Env, paymentId: number): Promise<void> {
  const payment = await env.DB.prepare("SELECT * FROM payments WHERE id = ?")
    .bind(paymentId)
    .first<PaymentRow>();
  if (!payment) return;

  if (payment.member_package_id) {
    await activateMemberPackage(env, payment.member_package_id);
    const mp = await env.DB.prepare(
      `SELECT mp.status, p.name AS package_name, u.line_user_id
       FROM member_packages mp JOIN packages p ON p.id = mp.package_id JOIN users u ON u.id = mp.user_id
       WHERE mp.id = ?`
    )
      .bind(payment.member_package_id)
      .first<{ status: string; package_name: string; line_user_id: string | null }>();
    if (mp?.line_user_id && mp.status === "active") {
      await pushLineMessage(env, mp.line_user_id, `✅ Payment received: ${mp.package_name} is now active.`);
    }
  }

  if (payment.package_renewal_id) {
    await applyExtendRenewal(env, payment.package_renewal_id);
  }
}
