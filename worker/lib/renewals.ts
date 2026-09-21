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

/** Renewal payment must land within this many days of the package's expiry (default 2). */
export async function getRenewalGraceDays(env: Env): Promise<number> {
  try {
    return await getSettingNumber(env, "renewal_payment_grace_days");
  } catch {
    return 2;
  }
}

/** Last moment a renewal (extension fee or new-package purchase) can be paid for. */
function paymentDeadline(expiresAt: string, graceDays: number): Date {
  return new Date(new Date(expiresAt).getTime() + graceDays * 86_400_000);
}

async function assertRenewable(env: Env, mp: MemberPackageRow): Promise<{ ok: true } | { ok: false; error: string }> {
  const pkg = await getPackage(env, mp.package_id);
  if (!pkg) return { ok: false, error: "Package not found" };
  if (!pkg.renewable) return { ok: false, error: `${pkg.name} is not eligible for renewal` };
  if (NON_RENEWABLE_KEYWORDS.some((k) => pkg.name.toLowerCase().includes(k))) {
    return { ok: false, error: `${pkg.name} is not eligible for renewal` };
  }
  if (mp.status !== "active" && mp.status !== "expired") {
    return { ok: false, error: `This package can't be renewed (${mp.status})` };
  }
  if (!mp.expires_at) return { ok: false, error: "Package has no expiry to renew" };
  const graceDays = await getRenewalGraceDays(env);
  if (Date.now() > paymentDeadline(mp.expires_at, graceDays).getTime()) {
    return { ok: false, error: `Renewal payment was due within ${graceDays} days of expiry, and that window has passed` };
  }
  return { ok: true };
}

/** Renewal options for the member UI, or null when the package isn't (yet) in a renewal window.
 * Shown once a package has expired or is within a week of expiring, until the payment deadline. */
export async function describeRenewalOptions(env: Env, mp: MemberPackageRow) {
  if (!mp.expires_at) return null;
  const check = await assertRenewable(env, mp);
  if (!check.ok) return null;
  const expires = new Date(mp.expires_at).getTime();
  if (expires - Date.now() > 7 * 86_400_000) return null;

  const [graceDays, windowMonths] = await Promise.all([
    getRenewalGraceDays(env),
    getSettingNumber(env, "renewal_combine_activation_window_months"),
  ]);
  const earmarked = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM member_packages WHERE combined_from_member_package_id = ? AND status != 'cancelled'"
  )
    .bind(mp.id)
    .first<{ n: number }>();
  const canCombine = mp.renewal_option_used !== "combine" && (earmarked?.n ?? 0) === 0;
  return {
    expired: expires < Date.now(),
    payBy: paymentDeadline(mp.expires_at, graceDays).toISOString(),
    activateBy: computeExpiry(mp.expires_at, windowMonths, "month"),
    remainingCredits: remainingCredits(mp),
    canCombine,
  };
}

/** Step 1 (section 17): purchase a new package that will absorb an old package's
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
  if (mp.renewal_option_used === "combine") {
    return { ok: false, error: "This package's remaining classes have already been rolled over" };
  }
  // Remaining classes can only roll over into ONE new package.
  const earmarked = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM member_packages WHERE combined_from_member_package_id = ? AND status != 'cancelled'"
  )
    .bind(mp.id)
    .first<{ n: number }>();
  if ((earmarked?.n ?? 0) > 0) {
    return { ok: false, error: "You already have a new package set to receive this package's remaining classes" };
  }
  return { ok: true };
}

/** Step 2 (section 17): activates a newly purchased package. If it was earmarked
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

  if (!withinWindow || old.renewal_option_used === "combine") {
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
