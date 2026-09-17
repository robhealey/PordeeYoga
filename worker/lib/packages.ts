import type { Env } from "../env.d.ts";
import { dateOnlyInTz, isWeekendOrHoliday } from "./holidays.ts";

export interface PackageRow {
  id: number;
  name: string;
  price_cents: number;
  currency: string;
  credits: number | null;
  validity_value: number | null;
  validity_unit: "day" | "month" | null;
  eligible_class_type_ids: string | null; // JSON array
  eligible_days: string | null; // JSON array
  max_bookings_per_day: number | null;
  renewable: number;
  shared: number;
  one_time_per_person: number;
  active: number;
}

export interface MemberPackageRow {
  id: number;
  user_id: number;
  package_id: number;
  credits_total: number | null;
  credits_used: number;
  price_paid_cents: number;
  currency: string;
  status: "pending_payment" | "paid_not_activated" | "active" | "expired" | "combined" | "cancelled";
  purchased_at: string;
  activated_at: string | null;
  expires_at: string | null;
  studio_cancelled_class_count: number;
  expiry_extension_flagged_at: string | null;
  renewal_option_used: "combine" | "extend" | null;
  renewed_into_member_package_id: number | null;
  combined_from_member_package_id: number | null;
}

export async function listActivePackages(env: Env): Promise<PackageRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM packages WHERE active = 1 ORDER BY sort_order ASC"
  ).all<PackageRow>();
  return results;
}

export async function getPackage(env: Env, id: number): Promise<PackageRow | null> {
  const row = await env.DB.prepare("SELECT * FROM packages WHERE id = ?").bind(id).first<PackageRow>();
  return row ?? null;
}

export async function getMemberPackage(env: Env, id: number): Promise<MemberPackageRow | null> {
  const row = await env.DB.prepare("SELECT * FROM member_packages WHERE id = ?")
    .bind(id)
    .first<MemberPackageRow>();
  return row ?? null;
}

export interface MemberPackageWithCatalog extends MemberPackageRow {
  package_name: string;
  package_shared: number;
  package_eligible_class_type_ids: string | null;
  package_eligible_days: string | null;
  package_max_bookings_per_day: number | null;
}

const MEMBER_PACKAGE_LIST_SELECT = `
  SELECT mp.*, p.name AS package_name, p.shared AS package_shared,
         p.eligible_class_type_ids AS package_eligible_class_type_ids,
         p.eligible_days AS package_eligible_days,
         p.max_bookings_per_day AS package_max_bookings_per_day
  FROM member_packages mp
  JOIN packages p ON p.id = mp.package_id
`;

/** Packages a member can pick from at booking time: their own active packages, plus any
 * shared pools they've been authorized on (section 6, 14). */
export async function listUsablePackagesForUser(
  env: Env,
  userId: number
): Promise<MemberPackageWithCatalog[]> {
  const { results } = await env.DB.prepare(
    `${MEMBER_PACKAGE_LIST_SELECT}
     WHERE mp.status = 'active'
       AND (mp.expires_at IS NULL OR mp.expires_at > datetime('now'))
       AND (mp.credits_total IS NULL OR mp.credits_used < mp.credits_total)
       AND (
         mp.user_id = ?
         OR mp.id IN (SELECT member_package_id FROM shared_coupon_members WHERE user_id = ?)
       )
     ORDER BY mp.expires_at ASC`
  )
    .bind(userId, userId)
    .all<MemberPackageWithCatalog>();
  return results;
}

export async function getMemberPackageWithCatalog(
  env: Env,
  id: number
): Promise<MemberPackageWithCatalog | null> {
  const row = await env.DB.prepare(`${MEMBER_PACKAGE_LIST_SELECT} WHERE mp.id = ?`)
    .bind(id)
    .first<MemberPackageWithCatalog>();
  return row ?? null;
}

export async function listMemberPackagesForUser(
  env: Env,
  userId: number
): Promise<MemberPackageWithCatalog[]> {
  const { results } = await env.DB.prepare(
    `${MEMBER_PACKAGE_LIST_SELECT} WHERE mp.user_id = ? ORDER BY mp.purchased_at DESC`
  )
    .bind(userId)
    .all<MemberPackageWithCatalog>();
  return results;
}

export function remainingCredits(mp: MemberPackageRow): number | null {
  if (mp.credits_total == null) return null;
  return Math.max(0, mp.credits_total - mp.credits_used);
}

export function computeExpiry(fromIso: string, validityValue: number, validityUnit: "day" | "month"): string {
  const d = new Date(fromIso);
  if (validityUnit === "day") {
    d.setUTCDate(d.getUTCDate() + validityValue);
  } else {
    d.setUTCMonth(d.getUTCMonth() + validityValue);
  }
  return d.toISOString();
}

/** Trial eligibility is checked by name + phone, not LINE user id, so one person can't
 * get repeated trials by logging in with a different LINE account (section 15). */
export async function hasUsedOneTimePackage(
  env: Env,
  packageId: number,
  fullName: string,
  phone: string
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 FROM member_packages mp
     JOIN users u ON u.id = mp.user_id
     WHERE mp.package_id = ?
       AND mp.status != 'cancelled'
       AND lower(trim(u.display_name)) = lower(trim(?))
       AND u.phone = ?
     LIMIT 1`
  )
    .bind(packageId, fullName, phone)
    .first();
  return row != null;
}

export async function createPendingMemberPackage(
  env: Env,
  userId: number,
  pkg: PackageRow,
  combinedFromMemberPackageId?: number
): Promise<MemberPackageRow> {
  const row = await env.DB.prepare(
    `INSERT INTO member_packages (user_id, package_id, credits_total, price_paid_cents, currency, status, combined_from_member_package_id)
     VALUES (?, ?, ?, ?, ?, 'pending_payment', ?) RETURNING *`
  )
    .bind(userId, pkg.id, pkg.credits, pkg.price_cents, pkg.currency, combinedFromMemberPackageId ?? null)
    .first<MemberPackageRow>();
  if (!row) throw new Error("Failed to create member package");
  if (combinedFromMemberPackageId) {
    await env.DB.prepare("UPDATE member_packages SET renewed_into_member_package_id = ? WHERE id = ?")
      .bind(row.id, combinedFromMemberPackageId)
      .run();
  }
  return row;
}

/** Flips a paid-for purchase out of `pending_payment`. Ordinary packages activate immediately
 * and start their validity clock; packages purchased to combine with an old package (section 17,
 * option 1) instead land in `paid_not_activated` until the member explicitly activates them via
 * `activateAndMaybeCombine`, since that's the moment the 2-month activation window is judged
 * against. Idempotent. */
export async function activateMemberPackage(env: Env, memberPackageId: number): Promise<void> {
  const mp = await getMemberPackage(env, memberPackageId);
  if (!mp || mp.status !== "pending_payment") return;

  if (mp.combined_from_member_package_id) {
    await env.DB.prepare("UPDATE member_packages SET status = 'paid_not_activated' WHERE id = ?")
      .bind(memberPackageId)
      .run();
    return;
  }

  const pkg = await getPackage(env, mp.package_id);
  if (!pkg) throw new Error("Package not found");

  const activatedAt = new Date().toISOString();
  const expiresAt =
    pkg.validity_value != null && pkg.validity_unit
      ? computeExpiry(activatedAt, pkg.validity_value, pkg.validity_unit)
      : null;

  await env.DB.prepare(
    "UPDATE member_packages SET status = 'active', activated_at = ?, expires_at = ? WHERE id = ?"
  )
    .bind(activatedAt, expiresAt, memberPackageId)
    .run();
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

/** Section 6: the system must check the member's chosen package is actually valid for the
 * chosen class (right class type, right day-of-week for Weekend packages). */
export async function checkPackageEligibleForClass(
  env: Env,
  mp: MemberPackageWithCatalog,
  classTypeId: number,
  classStartTime: string
): Promise<EligibilityResult> {
  if (mp.package_eligible_class_type_ids) {
    const ids: number[] = JSON.parse(mp.package_eligible_class_type_ids);
    if (!ids.includes(classTypeId)) {
      return { eligible: false, reason: "This package isn't valid for this class type" };
    }
  }
  if (mp.package_eligible_days) {
    const days: string[] = JSON.parse(mp.package_eligible_days);
    const weekendOrHoliday = await isWeekendOrHoliday(env, classStartTime);
    const requiresWeekend = days.includes("sat") || days.includes("sun") || days.includes("holiday");
    if (requiresWeekend && !weekendOrHoliday) {
      return { eligible: false, reason: "This package can only be used on weekends or public holidays" };
    }
  }
  return { eligible: true };
}

export async function isUserAuthorizedForMemberPackage(
  env: Env,
  memberPackageId: number,
  userId: number
): Promise<boolean> {
  const mp = await getMemberPackage(env, memberPackageId);
  if (!mp) return false;
  if (mp.user_id === userId) return true;
  const row = await env.DB.prepare(
    "SELECT 1 FROM shared_coupon_members WHERE member_package_id = ? AND user_id = ?"
  )
    .bind(memberPackageId, userId)
    .first();
  return row != null;
}

/** Section 7: Monthly-style packages cap active bookings per calendar day, checked live
 * (not a permanent block) so cancelling one frees up the day immediately. SQLite has no
 * timezone-aware date math, so we widen the SQL window to a UTC day either side of the
 * target date and do the exact studio-local-day comparison in JS. */
export async function countActiveBookingsForUserOnDate(
  env: Env,
  userId: number,
  classStartTimeIso: string,
  excludeBookingId?: number
): Promise<number> {
  const target = new Date(classStartTimeIso);
  const windowStart = new Date(target.getTime() - 36 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(target.getTime() + 36 * 60 * 60 * 1000).toISOString();
  const dateOnly = dateOnlyInTz(classStartTimeIso, env.TIMEZONE);

  const { results } = await env.DB.prepare(
    `SELECT b.id, cs.start_time
     FROM bookings b JOIN class_sessions cs ON cs.id = b.class_session_id
     WHERE b.user_id = ? AND b.status = 'confirmed'
       AND cs.start_time BETWEEN ? AND ?`
  )
    .bind(userId, windowStart, windowEnd)
    .all<{ id: number; start_time: string }>();

  return results.filter(
    (r) => r.id !== excludeBookingId && dateOnlyInTz(r.start_time, env.TIMEZONE) === dateOnly
  ).length;
}
