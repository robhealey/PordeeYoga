import type { Env } from "../env.d.ts";
import { pushLineMessage } from "./line.ts";
import {
  capacityFor,
  getSessionById,
  isSessionConfirmed,
  minCapacityFor,
  type ClassSessionRow,
} from "./db.ts";
import {
  checkPackageEligibleForClass,
  countActiveBookingsForUserOnDate,
  getMemberPackage,
  getMemberPackageWithCatalog,
  isUserAuthorizedForMemberPackage,
  remainingCredits,
  startPackageClockOnFirstUse,
} from "./packages.ts";
import { getLateBookingGraceMinutes, getSettingNumber } from "./settings.ts";
import { notifyNextWaiting } from "./waitlist.ts";
import { formatDateTimeForMessage } from "./dateFormat.ts";
import { classConfirmedMessage, notifyAssignedInstructor } from "./instructors.ts";

export interface BookingResult<T = { id: number }> {
  ok: boolean;
  status?: number;
  error?: string;
  data?: T;
}

interface BookingRow {
  id: number;
  user_id: number;
  class_session_id: number;
  member_package_id: number | null;
  birthday_coupon_id: number | null;
  credit_value_cents: number | null;
  status: string;
  credit_refunded: number;
}

async function getBookingRow(env: Env, id: number): Promise<BookingRow | null> {
  const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first<BookingRow>();
  return row ?? null;
}

/** Recomputes a session's status from current confirmed bookings. Status only ever
 * advances (scheduled -> confirmed/full); studio cancellations and completion are
 * handled by their own explicit actions, never overwritten here (section 4, 9). */
export async function recomputeSessionStatus(env: Env, classSessionId: number): Promise<void> {
  const session = await getSessionById(env, classSessionId);
  if (!session) return;
  if (session.status === "cancelled_by_studio" || session.status === "completed") return;

  const defaultMin = await getSettingNumber(env, "default_min_class_capacity");
  const capacity = capacityFor(session);
  const minCapacity = minCapacityFor(session, defaultMin);

  let next: ClassSessionRow["status"] = session.status;
  if (session.booked_count >= capacity) {
    next = "full";
  } else if (
    session.status === "confirmed" ||
    session.booked_count >= minCapacity ||
    (session.min_confirm_value_cents != null && session.booked_value_cents >= session.min_confirm_value_cents)
  ) {
    next = "confirmed";
  }

  const rank = { scheduled: 0, confirmed: 1, full: 2 } as Record<string, number>;
  if (rank[next] > rank[session.status]) {
    // Conditional on the old status so concurrent bookings only notify the instructor once.
    const r = await env.DB.prepare("UPDATE class_sessions SET status = ? WHERE id = ? AND status = ?")
      .bind(next, classSessionId, session.status)
      .run();
    if (r.meta.changes && session.status === "scheduled" && new Date(session.start_time).getTime() > Date.now()) {
      await notifyAssignedInstructor(env, classSessionId, classConfirmedMessage);
    }
  }
}

const BOOK_SQL = `
  INSERT INTO bookings (user_id, class_session_id, member_package_id, credit_value_cents, status)
  SELECT ?, ?, ?, ?, 'confirmed'
  WHERE NOT EXISTS (
    SELECT 1 FROM bookings WHERE user_id = ? AND class_session_id = ? AND member_package_id = ? AND status = 'confirmed'
  ) AND (
    SELECT COUNT(*) FROM bookings WHERE class_session_id = ? AND status = 'confirmed'
  ) < (
    SELECT COALESCE(cs.capacity_override, ct.capacity)
    FROM class_sessions cs JOIN class_types ct ON ct.id = cs.class_type_id
    WHERE cs.id = ?
  )
`;

/** Section 5-9: book a class using a specific member-selected package/credit source. */
export async function createBooking(
  env: Env,
  params: { userId: number; classSessionId: number; memberPackageId: number }
): Promise<BookingResult<{ id: number }>> {
  const session = await getSessionById(env, params.classSessionId);
  if (!session || session.status === "cancelled_by_studio") {
    return { ok: false, status: 404, error: "Class not available" };
  }
  const startMs = new Date(session.start_time).getTime();
  const graceMinutes = await getLateBookingGraceMinutes(env);
  if (startMs + graceMinutes * 60_000 <= Date.now()) {
    return { ok: false, status: 400, error: `Booking closes ${graceMinutes} minutes after the class starts` };
  }

  const bookingWindowDays = await getSettingNumber(env, "booking_window_days");
  const latestBookable = Date.now() + bookingWindowDays * 24 * 60 * 60 * 1000;
  if (startMs > latestBookable) {
    return { ok: false, status: 400, error: `Classes can only be booked up to ${bookingWindowDays} days in advance` };
  }

  if (session.booked_count >= capacityFor(session)) {
    return { ok: false, status: 409, error: "Class is full. Join the waitlist instead." };
  }

  const mp = await getMemberPackageWithCatalog(env, params.memberPackageId);
  if (!mp) return { ok: false, status: 404, error: "Package not found" };
  if (!(await isUserAuthorizedForMemberPackage(env, mp.id, params.userId))) {
    return { ok: false, status: 403, error: "You're not authorized to use this package" };
  }
  if (mp.status !== "active") return { ok: false, status: 400, error: "Package is not active" };
  if (mp.expires_at && new Date(mp.expires_at).getTime() <= Date.now()) {
    return { ok: false, status: 400, error: "Package has expired" };
  }
  const remaining = remainingCredits(mp);
  if (remaining !== null && remaining <= 0) {
    return { ok: false, status: 400, error: "No credits remaining on this package" };
  }

  const eligibility = await checkPackageEligibleForClass(env, mp, session.class_type_id, session.start_time);
  if (!eligibility.eligible) {
    return { ok: false, status: 400, error: eligibility.reason ?? "Package not eligible for this class" };
  }

  if (mp.package_max_bookings_per_day != null) {
    const activeToday = await countActiveBookingsForUserOnDate(env, params.userId, session.start_time, undefined, mp.id);
    if (activeToday >= mp.package_max_bookings_per_day) {
      return {
        ok: false,
        status: 409,
        error: `This package allows at most ${mp.package_max_bookings_per_day} class(es) per day`,
      };
    }
  }

  const creditValueCents = mp.credits_total != null ? Math.round(mp.price_paid_cents / mp.credits_total) : null;

  const insert = await env.DB.prepare(BOOK_SQL)
    .bind(
      params.userId,
      params.classSessionId,
      mp.id,
      creditValueCents,
      params.userId,
      params.classSessionId,
      mp.id,
      params.classSessionId,
      params.classSessionId
    )
    .run();
  if (insert.meta.changes === 0) {
    // The same person may book a class again, but only from a different package.
    const already = await env.DB.prepare(
      "SELECT 1 FROM bookings WHERE user_id = ? AND class_session_id = ? AND member_package_id = ? AND status = 'confirmed'"
    )
      .bind(params.userId, params.classSessionId, mp.id)
      .first();
    if (already) {
      return { ok: false, status: 409, error: "You've already booked this class with this package — pick a different package to book another spot" };
    }
    return { ok: false, status: 409, error: "Class is full. Join the waitlist instead." };
  }
  const bookingId = insert.meta.last_row_id;

  const deduct = await env.DB.prepare(
    `UPDATE member_packages SET credits_used = credits_used + 1
     WHERE id = ? AND status = 'active'
       AND (expires_at IS NULL OR expires_at > datetime('now'))
       AND (credits_total IS NULL OR credits_used < credits_total)`
  )
    .bind(mp.id)
    .run();
  if (deduct.meta.changes === 0) {
    await env.DB.prepare("DELETE FROM bookings WHERE id = ?").bind(bookingId).run();
    return { ok: false, status: 409, error: "This package no longer has an available credit" };
  }
  await startPackageClockOnFirstUse(env, mp.id);

  await recomputeSessionStatus(env, params.classSessionId);

  const user = await env.DB.prepare("SELECT line_user_id FROM users WHERE id = ?")
    .bind(params.userId)
    .first<{ line_user_id: string | null }>();
  if (user?.line_user_id) {
    const when = formatDateTimeForMessage(session.start_time, env.TIMEZONE);
    await pushLineMessage(env, user.line_user_id, `✅ Booking confirmed: ${session.class_name} on ${when}.`);
  }

  return { ok: true, data: { id: bookingId } };
}

/** Admin-only: manually books a member into a class, including classes that already happened
 * (to backfill history that predates the app, or fix a missed check-in) or that are full
 * (admin override). Unlike `createBooking`, this skips the booking-window, "already started",
 * per-day-limit and class-type-eligibility checks that apply to member self-service booking —
 * it still validates that a chosen package belongs to the member, is active, and has a credit
 * to give. */
export async function adminCreateBooking(
  env: Env,
  params: {
    userId: number;
    classSessionId: number;
    memberPackageId?: number | null;
    status: "confirmed" | "attended" | "no_show";
  }
): Promise<BookingResult<{ id: number }>> {
  const session = await getSessionById(env, params.classSessionId);
  if (!session) return { ok: false, status: 404, error: "Class not found" };
  if (session.status === "cancelled_by_studio") {
    return { ok: false, status: 400, error: "This class was cancelled" };
  }

  const member = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(params.userId).first();
  if (!member) return { ok: false, status: 404, error: "Member not found" };

  const already = await env.DB.prepare(
    `SELECT 1 FROM bookings WHERE user_id = ? AND class_session_id = ? AND member_package_id IS ?
       AND status NOT IN ('cancelled_by_member', 'cancelled_by_studio', 'late_cancelled')`
  )
    .bind(params.userId, params.classSessionId, params.memberPackageId ?? null)
    .first();
  if (already) {
    return { ok: false, status: 409, error: "This member is already booked into this class with that package" };
  }

  let creditValueCents: number | null = null;
  let mpId: number | null = null;
  if (params.memberPackageId) {
    const mp = await getMemberPackageWithCatalog(env, params.memberPackageId);
    if (!mp) return { ok: false, status: 404, error: "Package not found" };
    if (!(await isUserAuthorizedForMemberPackage(env, mp.id, params.userId))) {
      return { ok: false, status: 403, error: "That package doesn't belong to this member" };
    }
    if (mp.status !== "active") return { ok: false, status: 400, error: "Package is not active" };
    const remaining = remainingCredits(mp);
    if (remaining !== null && remaining <= 0) {
      return { ok: false, status: 400, error: "No credits remaining on this package" };
    }
    creditValueCents = mp.credits_total != null ? Math.round(mp.price_paid_cents / mp.credits_total) : null;
    mpId = mp.id;
  }

  const insert = await env.DB.prepare(
    "INSERT INTO bookings (user_id, class_session_id, member_package_id, credit_value_cents, status) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(params.userId, params.classSessionId, mpId, creditValueCents, params.status)
    .run();
  const bookingId = insert.meta.last_row_id;

  if (mpId) {
    await env.DB.prepare("UPDATE member_packages SET credits_used = credits_used + 1 WHERE id = ?").bind(mpId).run();
    await startPackageClockOnFirstUse(env, mpId);
  }

  if (session.status !== "completed") {
    await recomputeSessionStatus(env, params.classSessionId);
  }

  return { ok: true, data: { id: bookingId } };
}

async function refundCredit(env: Env, booking: BookingRow): Promise<void> {
  if (booking.member_package_id) {
    await env.DB.prepare(
      "UPDATE member_packages SET credits_used = MAX(0, credits_used - 1) WHERE id = ?"
    )
      .bind(booking.member_package_id)
      .run();
  }
  if (booking.birthday_coupon_id) {
    await env.DB.prepare(
      "UPDATE birthday_coupons SET status = 'active', used_at = NULL, used_booking_id = NULL, actual_user_id = NULL WHERE id = ?"
    )
      .bind(booking.birthday_coupon_id)
      .run();
  }
}

/** Section 10: member-initiated cancellation. Free by default. The only time a credit is
 * taken is when cancelling would leave exactly one person still booked in the class AND
 * it's within the solo-spot window of the class start. */
export async function cancelBooking(
  env: Env,
  params: { bookingId: number; actingUserId: number; isAdmin: boolean }
): Promise<BookingResult<{ status: string; creditRefunded: boolean }>> {
  const booking = await getBookingRow(env, params.bookingId);
  if (!booking) return { ok: false, status: 404, error: "Booking not found" };
  if (!params.isAdmin && booking.user_id !== params.actingUserId) {
    return { ok: false, status: 403, error: "Not your booking" };
  }
  if (booking.status !== "confirmed") {
    return { ok: false, status: 400, error: `Booking is not active (status: ${booking.status})` };
  }

  const session = await getSessionById(env, booking.class_session_id);
  if (!session) return { ok: false, status: 404, error: "Class not found" };
  if (new Date(session.start_time).getTime() <= Date.now()) {
    return { ok: false, status: 400, error: "Cannot cancel a class that has already started" };
  }

  const soloSpotWindowMinutes = await getSettingNumber(env, "solo_spot_cancel_window_minutes");
  const minutesUntilStart = (new Date(session.start_time).getTime() - Date.now()) / 60_000;
  const wouldLeaveOneSpot = session.booked_count - 1 === 1;
  const refund = !(wouldLeaveOneSpot && minutesUntilStart < soloSpotWindowMinutes);
  const newStatus = !refund ? "late_cancelled" : "cancelled_by_member";

  await env.DB.prepare(
    "UPDATE bookings SET status = ?, credit_refunded = ?, cancelled_at = datetime('now') WHERE id = ?"
  )
    .bind(newStatus, refund ? 1 : 0, booking.id)
    .run();

  if (refund) await refundCredit(env, booking);

  await notifyNextWaiting(env, booking.class_session_id);

  return { ok: true, data: { status: newStatus, creditRefunded: refund } };
}

/** Admin marks a member absent after class time. Same minimum-attendance exception as
 * late cancellation (section 10). */
export async function markNoShow(env: Env, bookingId: number): Promise<BookingResult<{ creditRefunded: boolean }>> {
  const booking = await getBookingRow(env, bookingId);
  if (!booking) return { ok: false, status: 404, error: "Booking not found" };
  if (booking.status !== "confirmed") {
    return { ok: false, status: 400, error: `Booking is not active (status: ${booking.status})` };
  }
  const session = await getSessionById(env, booking.class_session_id);
  if (!session) return { ok: false, status: 404, error: "Class not found" };

  const refund = !isSessionConfirmed(session);
  await env.DB.prepare(
    "UPDATE bookings SET status = 'no_show', credit_refunded = ?, cancelled_at = datetime('now') WHERE id = ?"
  )
    .bind(refund ? 1 : 0, booking.id)
    .run();
  if (refund) await refundCredit(env, booking);

  return { ok: true, data: { creditRefunded: refund } };
}

export async function markAttended(env: Env, bookingId: number): Promise<BookingResult> {
  const booking = await getBookingRow(env, bookingId);
  if (!booking) return { ok: false, status: 404, error: "Booking not found" };
  if (booking.status !== "confirmed") {
    return { ok: false, status: 400, error: `Booking is not active (status: ${booking.status})` };
  }
  await env.DB.prepare("UPDATE bookings SET status = 'attended' WHERE id = ?").bind(booking.id).run();
  return { ok: true };
}

/** Section 12-13: studio cancels an entire class. Every confirmed booking is auto-refunded;
 * package-backed bookings count toward the studio's 2-cancellation expiry-extension trigger. */
export async function studioCancel(
  env: Env,
  params: { classSessionId: number; adminUserId: number; reason?: string }
): Promise<BookingResult<{ refundedCount: number }>> {
  const session = await getSessionById(env, params.classSessionId);
  if (!session) return { ok: false, status: 404, error: "Class not found" };
  if (session.status === "cancelled_by_studio") return { ok: true, data: { refundedCount: 0 } };

  const defaultMin = await getSettingNumber(env, "default_min_class_capacity");
  const minimumNotReached = session.booked_count < minCapacityFor(session, defaultMin);
  const reason = params.reason ?? (minimumNotReached ? "Minimum attendance not reached" : "Cancelled by studio");
  const threshold = await getSettingNumber(env, "studio_cancellations_for_extension_eligibility");

  const { results: affected } = await env.DB.prepare(
    "SELECT * FROM bookings WHERE class_session_id = ? AND status = 'confirmed'"
  )
    .bind(params.classSessionId)
    .all<BookingRow>();

  for (const booking of affected) {
    await env.DB.prepare(
      "UPDATE bookings SET status = 'cancelled_by_studio', credit_refunded = 1, cancelled_at = datetime('now') WHERE id = ?"
    )
      .bind(booking.id)
      .run();
    await refundCredit(env, booking);

    if (booking.member_package_id) {
      await env.DB.prepare(
        "UPDATE member_packages SET studio_cancelled_class_count = studio_cancelled_class_count + 1 WHERE id = ?"
      )
        .bind(booking.member_package_id)
        .run();
      const mp = await getMemberPackage(env, booking.member_package_id);
      if (mp && mp.studio_cancelled_class_count >= threshold && !mp.expiry_extension_flagged_at) {
        await env.DB.prepare(
          "UPDATE member_packages SET expiry_extension_flagged_at = datetime('now') WHERE id = ?"
        )
          .bind(mp.id)
          .run();
      }
    }

    const user = await env.DB.prepare("SELECT line_user_id FROM users WHERE id = ?")
      .bind(booking.user_id)
      .first<{ line_user_id: string | null }>();
    if (user?.line_user_id) {
      await pushLineMessage(
        env,
        user.line_user_id,
        `⚠️ ${session.class_name} on ${formatDateTimeForMessage(session.start_time, env.TIMEZONE)} was cancelled by the studio. Your credit has been returned.`
      );
    }
  }

  await env.DB.prepare(
    "UPDATE class_sessions SET status = 'cancelled_by_studio', cancellation_reason = ?, cancelled_at = datetime('now') WHERE id = ?"
  )
    .bind(reason, params.classSessionId)
    .run();

  await env.DB.prepare(
    "UPDATE waitlist_entries SET status = 'cancelled' WHERE class_session_id = ? AND status IN ('waiting', 'notified')"
  )
    .bind(params.classSessionId)
    .run();

  await notifyAssignedInstructor(
    env,
    params.classSessionId,
    (className, when) => `❌ Your class has been cancelled: ${className} on ${when}. Reason: ${reason}.`
  );

  return { ok: true, data: { refundedCount: affected.length } };
}

/** Member claims a spot after being notified off the waitlist (section 11). Reuses the same
 * booking-creation rules/credit checks as a direct booking. */
export async function claimWaitlistSpot(
  env: Env,
  params: { waitlistEntryId: number; userId: number; memberPackageId: number }
): Promise<BookingResult<{ id: number }>> {
  const entry = await env.DB.prepare("SELECT * FROM waitlist_entries WHERE id = ?")
    .bind(params.waitlistEntryId)
    .first<{ id: number; user_id: number; class_session_id: number; status: string; notify_expires_at: string | null }>();
  if (!entry || entry.user_id !== params.userId) return { ok: false, status: 404, error: "Waitlist entry not found" };
  if (entry.status !== "notified") return { ok: false, status: 400, error: "This waitlist spot is not currently offered to you" };
  if (entry.notify_expires_at && new Date(entry.notify_expires_at).getTime() < Date.now()) {
    return { ok: false, status: 400, error: "Your claim window has expired" };
  }

  const result = await createBooking(env, {
    userId: params.userId,
    classSessionId: entry.class_session_id,
    memberPackageId: params.memberPackageId,
  });
  if (!result.ok) return result;

  await env.DB.prepare("UPDATE waitlist_entries SET status = 'reserved' WHERE id = ?").bind(entry.id).run();
  return result;
}
