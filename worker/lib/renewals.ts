import type { Env } from "../env.d.ts";
import { computeExpiry, getMemberPackage, getPackage, remainingCredits, type MemberPackageRow } from "./packages.ts";
import { getSettingNumber } from "./settings.ts";

export interface RenewalResult<T = unknown> {
  ok: boolean;
  status?: number;
  error?: string;
  data?: T;
}

/** Packages excluded from any renewal option (section 17). */
const NON_RENEWABLE_KEYWORDS = ["online", "weekend", "coupon", "trial", "drop-in"];

async function assertRenewable(env: Env, mp: MemberPackageRow): Promise<{ ok: true } | { ok: false; error: string }> {
  const pkg = await getPackage(env, mp.package_id);
  if (!pkg) return { ok: false, error: "Package not found" };
  if (!pkg.renewable) return { ok: false, error: `${pkg.name} is not eligible for renewal` };
  if (NON_RENEWABLE_KEYWORDS.some((k) => pkg.name.toLowerCase().includes(k))) {
    return { ok: false, error: `${pkg.name} is not eligible for renewal` };
  }
  if (mp.renewal_option_used) {
    return { ok: false, error: "This package has already used its renewal option" };
  }
  if (!mp.expires_at) return { ok: false, error: "Package has no expiry to renew" };
  return { ok: true };
}

/** Option 2, step 1 (section 17): request the 1-month/THB 500 extension. Recorded as
 * `pending` and not applied to the package until the fee is actually paid — see
 * `applyExtendRenewal`. Must be requested on/before the original expiry. */
export async function createExtendRenewalRequest(
  env: Env,
  params: { memberPackageId: number; processedBy: "member" | "admin" }
): Promise<RenewalResult<{ renewalId: number; feeCents: number; newExpiresAt: string }>> {
  const mp = await getMemberPackage(env, params.memberPackageId);
  if (!mp) return { ok: false, status: 404, error: "Package not found" };

  const check = await assertRenewable(env, mp);
  if (!check.ok) return { ok: false, status: 400, error: check.error };

  if (new Date(mp.expires_at!).getTime() < Date.now()) {
    return { ok: false, status: 400, error: "Renewal must be requested on or before the original expiry date" };
  }

  const months = await getSettingNumber(env, "renewal_extend_months");
  const feeCents = await getSettingNumber(env, "renewal_extend_fee_cents");
  const newExpiresAt = computeExpiry(mp.expires_at!, months, "month");

  const renewal = await env.DB.prepare(
    `INSERT INTO package_renewals
       (old_member_package_id, option, old_expires_at, old_remaining_credits, new_expires_at, fee_cents, status, processed_by)
     VALUES (?, 'extend', ?, ?, ?, ?, 'pending', ?) RETURNING *`
  )
    .bind(mp.id, mp.expires_at, remainingCredits(mp), newExpiresAt, feeCents, params.processedBy)
    .first<{ id: number }>();
  if (!renewal) throw new Error("Failed to record renewal");

  return { ok: true, data: { renewalId: renewal.id, feeCents, newExpiresAt } };
}

/** Applies a previously-requested extension once its fee payment has succeeded. Idempotent. */
export async function applyExtendRenewal(env: Env, renewalId: number): Promise<void> {
  const renewal = await env.DB.prepare("SELECT * FROM package_renewals WHERE id = ?")
    .bind(renewalId)
    .first<{ id: number; status: string; old_member_package_id: number; new_expires_at: string }>();
  if (!renewal || renewal.status !== "pending") return;

  await env.DB.prepare(
    "UPDATE member_packages SET expires_at = ?, status = 'active', renewal_option_used = 'extend' WHERE id = ?"
  )
    .bind(renewal.new_expires_at, renewal.old_member_package_id)
    .run();
  await env.DB.prepare("UPDATE package_renewals SET status = 'applied' WHERE id = ?").bind(renewal.id).run();
}

/** Option 1, step 1 (section 17): purchase a new package that will absorb an old package's
 * remaining credits once activated. Validated at initiation; the combination itself happens
 * in `activateAndMaybeCombine` once the member actually activates the new package. */
export async function assertCombinePurchaseAllowed(
  env: Env,
  oldMemberPackageId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const mp = await getMemberPackage(env, oldMemberPackageId);
  if (!mp) return { ok: false, error: "Package not found" };
  const check = await assertRenewable(env, mp);
  if (!check.ok) return check;
  if (new Date(mp.expires_at!).getTime() < Date.now()) {
    return { ok: false, error: "The new package must be purchased on or before the original package's expiry date" };
  }
  return { ok: true };
}

/** Option 1, step 2 (section 17): activates a newly purchased package. If it was earmarked
 * to combine with an old package (`combined_from_member_package_id`) and the 2-month
 * activation window from the OLD package's expiry hasn't passed, absorb the old package's
 * remaining credits and apply the new package's expiry to the combined balance. Otherwise
 * (window missed, or not a combine purchase) it just activates normally. */
export async function activateAndMaybeCombine(
  env: Env,
  memberPackageId: number,
  processedBy: "member" | "admin" = "member"
): Promise<RenewalResult<{ combined: boolean }>> {
  const mp = await getMemberPackage(env, memberPackageId);
  if (!mp) return { ok: false, status: 404, error: "Package not found" };
  if (mp.status !== "paid_not_activated") {
    return { ok: false, status: 400, error: `Package cannot be activated from status ${mp.status}` };
  }
  const pkg = await getPackage(env, mp.package_id);
  if (!pkg) return { ok: false, status: 404, error: "Package catalog entry not found" };

  const now = new Date().toISOString();
  const ownExpiresAt = pkg.validity_value != null && pkg.validity_unit ? computeExpiry(now, pkg.validity_value, pkg.validity_unit) : null;

  if (!mp.combined_from_member_package_id) {
    await env.DB.prepare(
      "UPDATE member_packages SET status = 'active', activated_at = ?, expires_at = ? WHERE id = ?"
    )
      .bind(now, ownExpiresAt, mp.id)
      .run();
    return { ok: true, data: { combined: false } };
  }

  const old = await getMemberPackage(env, mp.combined_from_member_package_id);
  if (!old) return { ok: false, status: 404, error: "Original package not found" };

  const windowMonths = await getSettingNumber(env, "renewal_combine_activation_window_months");
  const deadline = computeExpiry(old.expires_at!, windowMonths, "month");
  const withinWindow = Date.now() <= new Date(deadline).getTime();

  if (!withinWindow || old.renewal_option_used) {
    await env.DB.prepare(
      "UPDATE member_packages SET status = 'active', activated_at = ?, expires_at = ? WHERE id = ?"
    )
      .bind(now, ownExpiresAt, mp.id)
      .run();
    return { ok: true, data: { combined: false } };
  }

  const oldRemaining = remainingCredits(old) ?? 0;
  const combinedCredits = mp.credits_total != null ? mp.credits_total + oldRemaining : null;

  await env.DB.prepare(
    "UPDATE member_packages SET status = 'active', activated_at = ?, expires_at = ?, credits_total = ? WHERE id = ?"
  )
    .bind(now, ownExpiresAt, combinedCredits, mp.id)
    .run();

  await env.DB.prepare(
    "UPDATE member_packages SET status = 'combined', renewal_option_used = 'combine', renewed_into_member_package_id = ? WHERE id = ?"
  )
    .bind(mp.id, old.id)
    .run();

  await env.DB.prepare(
    `INSERT INTO package_renewals
       (old_member_package_id, option, old_expires_at, old_remaining_credits, new_member_package_id, credits_after_combination, new_expires_at, processed_by)
     VALUES (?, 'combine', ?, ?, ?, ?, ?, ?)`
  )
    .bind(old.id, old.expires_at, oldRemaining, mp.id, combinedCredits, ownExpiresAt, processedBy)
    .run();

  return { ok: true, data: { combined: true } };
}
