import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { attachUser, requireUser } from "../middleware/auth.ts";
import { cancelBooking, createBooking } from "../lib/bookings.ts";
import { bookWithBirthdayCoupon } from "../lib/coupons.ts";

const bookings = new Hono<AppEnv>();

bookings.use("*", attachUser);

bookings.post("/", requireUser, async (c) => {
  const user = c.get("user")!;
  const { classSessionId, memberPackageId } = await c.req.json<{ classSessionId: number; memberPackageId: number }>();
  if (!Number.isInteger(classSessionId) || !Number.isInteger(memberPackageId)) {
    return c.json({ error: "classSessionId and memberPackageId are required" }, 400);
  }

  const result = await createBooking(c.env, { userId: user.id, classSessionId, memberPackageId });
  if (!result.ok) return c.json({ error: result.error }, (result.status ?? 400) as 400 | 403 | 404 | 409);
  return c.json({ booking: result.data }, 201);
});

/** Section 16: book using a birthday coupon; the coupon owner can designate a different attendee. */
bookings.post("/birthday-coupon", requireUser, async (c) => {
  const user = c.get("user")!;
  const { classSessionId, birthdayCouponId, attendeeUserId } = await c.req.json<{
    classSessionId: number;
    birthdayCouponId: number;
    attendeeUserId?: number;
  }>();
  if (!Number.isInteger(classSessionId) || !Number.isInteger(birthdayCouponId)) {
    return c.json({ error: "classSessionId and birthdayCouponId are required" }, 400);
  }

  const result = await bookWithBirthdayCoupon(c.env, {
    classSessionId,
    birthdayCouponId,
    attendeeUserId: attendeeUserId ?? user.id,
    requestingUserId: user.id,
    isAdmin: user.role === "admin",
  });
  if (!result.ok) return c.json({ error: result.error }, (result.status ?? 400) as 400 | 403 | 404 | 409);
  return c.json({ booking: result.data }, 201);
});

const BOOKING_LIST_SELECT = `
  SELECT b.id, b.status, b.credit_refunded, b.cancelled_at, b.created_at,
         cs.id AS class_session_id, cs.start_time, cs.end_time,
         ct.name AS class_name,
         mp.id AS member_package_id, p.name AS package_name,
         bc.id AS birthday_coupon_id
  FROM bookings b
  JOIN class_sessions cs ON cs.id = b.class_session_id
  JOIN class_types ct ON ct.id = cs.class_type_id
  LEFT JOIN member_packages mp ON mp.id = b.member_package_id
  LEFT JOIN packages p ON p.id = mp.package_id
  LEFT JOIN birthday_coupons bc ON bc.id = b.birthday_coupon_id
`;

bookings.get("/me", requireUser, async (c) => {
  const user = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    `${BOOKING_LIST_SELECT} WHERE b.user_id = ? ORDER BY cs.start_time DESC`
  )
    .bind(user.id)
    .all();
  return c.json({ bookings: results });
});

bookings.get("/:id", requireUser, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid booking id" }, 400);

  const booking = await c.env.DB.prepare(`${BOOKING_LIST_SELECT} WHERE b.id = ? AND b.user_id = ?`)
    .bind(id, user.id)
    .first();
  if (!booking) return c.json({ error: "Not found" }, 404);
  return c.json({ booking });
});

bookings.delete("/:id", requireUser, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid booking id" }, 400);

  const result = await cancelBooking(c.env, { bookingId: id, actingUserId: user.id, isAdmin: false });
  if (!result.ok) return c.json({ error: result.error }, (result.status ?? 400) as 400 | 403 | 404);
  return c.json(result.data);
});

export default bookings;
