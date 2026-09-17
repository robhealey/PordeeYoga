import type { Env } from "../env.d.ts";
import { capacityFor, getSessionById } from "./db.ts";
import { recomputeSessionStatus, type BookingResult } from "./bookings.ts";
import { getSettingNumber } from "./settings.ts";
import { pushLineMessage } from "./line.ts";

export interface BirthdayCoupon {
  id: number;
  user_id: number;
  issued_at: string;
  expires_at: string;
  status: "active" | "used" | "expired";
  actual_user_id: number | null;
  used_at: string | null;
  used_booking_id: number | null;
}

/** Section 16: birthday coupons are issued by admin, valid 6 months, single use. */
export async function issueBirthdayCoupon(env: Env, userId: number): Promise<BirthdayCoupon> {
  const months = await getSettingNumber(env, "birthday_coupon_validity_months");
  const expiresAt = new Date();
  expiresAt.setUTCMonth(expiresAt.getUTCMonth() + months);
  const row = await env.DB.prepare(
    "INSERT INTO birthday_coupons (user_id, expires_at, status) VALUES (?, ?, 'active') RETURNING *"
  )
    .bind(userId, expiresAt.toISOString())
    .first<BirthdayCoupon>();
  if (!row) throw new Error("Failed to issue birthday coupon");
  return row;
}

export async function listBirthdayCouponsForUser(env: Env, userId: number): Promise<BirthdayCoupon[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM birthday_coupons WHERE user_id = ? ORDER BY issued_at DESC"
  )
    .bind(userId)
    .all<BirthdayCoupon>();
  return results;
}

export async function getBirthdayCoupon(env: Env, id: number): Promise<BirthdayCoupon | null> {
  const row = await env.DB.prepare("SELECT * FROM birthday_coupons WHERE id = ?").bind(id).first<BirthdayCoupon>();
  return row ?? null;
}

const BOOK_WITH_COUPON_SQL = `
  INSERT INTO bookings (user_id, class_session_id, birthday_coupon_id, status)
  SELECT ?, ?, ?, 'confirmed'
  WHERE NOT EXISTS (
    SELECT 1 FROM bookings WHERE user_id = ? AND class_session_id = ? AND status = 'confirmed'
  ) AND (
    SELECT COUNT(*) FROM bookings WHERE class_session_id = ? AND status = 'confirmed'
  ) < (
    SELECT COALESCE(cs.capacity_override, ct.capacity)
    FROM class_sessions cs JOIN class_types ct ON ct.id = cs.class_type_id
    WHERE cs.id = ?
  )
`;

/** Books a class using a birthday coupon. The coupon must originate from its recipient
 * (`requestingUserId`), but the seat/attendee can be a different person (section 16). */
export async function bookWithBirthdayCoupon(
  env: Env,
  params: { classSessionId: number; birthdayCouponId: number; attendeeUserId: number; requestingUserId: number; isAdmin: boolean }
): Promise<BookingResult<{ id: number }>> {
  const coupon = await getBirthdayCoupon(env, params.birthdayCouponId);
  if (!coupon) return { ok: false, status: 404, error: "Coupon not found" };
  if (!params.isAdmin && coupon.user_id !== params.requestingUserId) {
    return { ok: false, status: 403, error: "This coupon belongs to a different member" };
  }
  if (coupon.status !== "active") return { ok: false, status: 400, error: `Coupon is ${coupon.status}` };
  if (new Date(coupon.expires_at).getTime() <= Date.now()) {
    return { ok: false, status: 400, error: "Coupon has expired" };
  }

  const session = await getSessionById(env, params.classSessionId);
  if (!session || session.status === "cancelled_by_studio") {
    return { ok: false, status: 404, error: "Class not available" };
  }
  if (new Date(session.start_time).getTime() <= Date.now()) {
    return { ok: false, status: 400, error: "Class has already started" };
  }
  const bookingWindowDays = await getSettingNumber(env, "booking_window_days");
  if (new Date(session.start_time).getTime() > Date.now() + bookingWindowDays * 24 * 60 * 60 * 1000) {
    return { ok: false, status: 400, error: `Classes can only be booked up to ${bookingWindowDays} days in advance` };
  }
  if (session.booked_count >= capacityFor(session)) {
    return { ok: false, status: 409, error: "Class is full. Join the waitlist instead." };
  }

  const insert = await env.DB.prepare(BOOK_WITH_COUPON_SQL)
    .bind(
      params.attendeeUserId,
      params.classSessionId,
      coupon.id,
      params.attendeeUserId,
      params.classSessionId,
      params.classSessionId,
      params.classSessionId
    )
    .run();
  if (insert.meta.changes === 0) {
    const already = await env.DB.prepare(
      "SELECT 1 FROM bookings WHERE user_id = ? AND class_session_id = ? AND status = 'confirmed'"
    )
      .bind(params.attendeeUserId, params.classSessionId)
      .first();
    if (already) return { ok: false, status: 409, error: "This member already has a booking for this class" };
    return { ok: false, status: 409, error: "Class is full. Join the waitlist instead." };
  }
  const inserted = await env.DB.prepare(
    "SELECT id FROM bookings WHERE user_id = ? AND class_session_id = ? AND status = 'confirmed' ORDER BY id DESC LIMIT 1"
  )
    .bind(params.attendeeUserId, params.classSessionId)
    .first<{ id: number }>();
  const bookingId = inserted!.id;

  const claim = await env.DB.prepare(
    "UPDATE birthday_coupons SET status = 'used', actual_user_id = ?, used_at = datetime('now'), used_booking_id = ? WHERE id = ? AND status = 'active'"
  )
    .bind(params.attendeeUserId, bookingId, coupon.id)
    .run();
  if (claim.meta.changes === 0) {
    await env.DB.prepare("DELETE FROM bookings WHERE id = ?").bind(bookingId).run();
    return { ok: false, status: 409, error: "Coupon was already used" };
  }

  await recomputeSessionStatus(env, params.classSessionId);

  const attendee = await env.DB.prepare("SELECT line_user_id FROM users WHERE id = ?")
    .bind(params.attendeeUserId)
    .first<{ line_user_id: string | null }>();
  if (attendee?.line_user_id) {
    const when = new Date(session.start_time).toLocaleString("en-US", { timeZone: env.TIMEZONE, dateStyle: "medium", timeStyle: "short" });
    await pushLineMessage(env, attendee.line_user_id, `✅ Booking confirmed: ${session.class_name} on ${when}.`);
  }

  return { ok: true, data: { id: bookingId } };
}

// -- Shared coupon pool membership (section 14) --

export async function addSharedCouponMember(env: Env, memberPackageId: number, userId: number): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO shared_coupon_members (member_package_id, user_id) VALUES (?, ?)"
  )
    .bind(memberPackageId, userId)
    .run();
}

export async function removeSharedCouponMember(env: Env, memberPackageId: number, userId: number): Promise<void> {
  await env.DB.prepare("DELETE FROM shared_coupon_members WHERE member_package_id = ? AND user_id = ?")
    .bind(memberPackageId, userId)
    .run();
}

export interface SharedCouponMember {
  user_id: number;
  display_name: string;
  added_at: string;
}

export async function listSharedCouponMembers(env: Env, memberPackageId: number): Promise<SharedCouponMember[]> {
  const { results } = await env.DB.prepare(
    `SELECT scm.user_id, u.display_name, scm.added_at FROM shared_coupon_members scm
     JOIN users u ON u.id = scm.user_id WHERE scm.member_package_id = ? ORDER BY scm.added_at ASC`
  )
    .bind(memberPackageId)
    .all<SharedCouponMember>();
  return results;
}

export interface SharedCouponUsage {
  booking_id: number;
  user_id: number;
  display_name: string;
  class_name: string;
  start_time: string;
  status: string;
  created_at: string;
}

/** Per-member usage breakdown of a shared pool: who used how many credits (section 14). */
export async function listSharedCouponUsage(env: Env, memberPackageId: number): Promise<SharedCouponUsage[]> {
  const { results } = await env.DB.prepare(
    `SELECT b.id AS booking_id, b.user_id, u.display_name, ct.name AS class_name, cs.start_time, b.status, b.created_at
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     JOIN class_sessions cs ON cs.id = b.class_session_id
     JOIN class_types ct ON ct.id = cs.class_type_id
     WHERE b.member_package_id = ?
     ORDER BY b.created_at DESC`
  )
    .bind(memberPackageId)
    .all<SharedCouponUsage>();
  return results;
}
