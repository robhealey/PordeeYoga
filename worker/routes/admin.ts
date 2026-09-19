import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { attachUser, requireAdmin } from "../middleware/auth.ts";
import { studioCancel, markAttended, markNoShow, cancelBooking, recomputeSessionStatus } from "../lib/bookings.ts";
import {
  addHoliday,
  getHoliday,
  listHolidays,
  removeHoliday,
  updateHoliday,
} from "../lib/holidays.ts";
import { getAllSettings, setSetting, type SettingKey } from "../lib/settings.ts";
import {
  activateMemberPackage,
  createPendingMemberPackage,
  getMemberPackage,
  getPackage,
  remainingCredits,
} from "../lib/packages.ts";
import {
  activateAndMaybeCombine,
  applyExtendRenewal,
  createExtendRenewalRequest,
} from "../lib/renewals.ts";
import {
  addSharedCouponMember,
  issueBirthdayCoupon,
  listBirthdayCouponsForUser,
  listSharedCouponMembers,
  listSharedCouponUsage,
  removeSharedCouponMember,
} from "../lib/coupons.ts";
import { listWaitlistForSession } from "../lib/waitlist.ts";
import { pushLineMessage } from "../lib/line.ts";

const admin = new Hono<AppEnv>();

admin.use("*", attachUser, requireAdmin);

// -- Class types (section 3) ---------------------------------------------------

admin.get("/class-types", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM class_types ORDER BY active DESC, name ASC").all();
  return c.json({ classTypes: results });
});

admin.post("/class-types", async (c) => {
  const body = await c.req.json<{
    name: string;
    description?: string;
    durationMinutes: number;
    capacity: number;
    priceCents: number;
    currency?: string;
    minConfirmCount?: number;
    minConfirmValueCents?: number | null;
  }>();
  if (!body.name || !body.durationMinutes || !body.capacity || body.priceCents == null) {
    return c.json({ error: "name, durationMinutes, capacity, priceCents are required" }, 400);
  }
  const row = await c.env.DB.prepare(
    `INSERT INTO class_types (name, description, duration_minutes, capacity, price_cents, currency, min_confirm_count, min_confirm_value_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  )
    .bind(
      body.name,
      body.description ?? null,
      body.durationMinutes,
      body.capacity,
      body.priceCents,
      body.currency ?? "THB",
      body.minConfirmCount ?? 2,
      body.minConfirmValueCents ?? null
    )
    .first();
  return c.json({ classType: row }, 201);
});

admin.patch("/class-types/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Record<string, unknown>>();
  const fieldMap: Record<string, string> = {
    name: "name",
    description: "description",
    durationMinutes: "duration_minutes",
    capacity: "capacity",
    priceCents: "price_cents",
    currency: "currency",
    active: "active",
    minConfirmCount: "min_confirm_count",
    minConfirmValueCents: "min_confirm_value_cents",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in body) {
      sets.push(`${column} = ?`);
      values.push(body[key]);
    }
  }
  if (sets.length === 0) return c.json({ error: "No fields to update" }, 400);
  values.push(id);
  const row = await c.env.DB.prepare(`UPDATE class_types SET ${sets.join(", ")} WHERE id = ? RETURNING *`)
    .bind(...values)
    .first();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ classType: row });
});

// -- Class sessions (sections 4, 9, 12) -----------------------------------------

admin.get("/class-sessions", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT cs.*, ct.name AS class_name, ct.capacity AS class_capacity, i.name AS instructor_name,
            (SELECT COUNT(*) FROM bookings b WHERE b.class_session_id = cs.id AND b.status = 'confirmed') AS booked_count
     FROM class_sessions cs
     JOIN class_types ct ON ct.id = cs.class_type_id
     LEFT JOIN instructors i ON i.id = cs.instructor_id
     ORDER BY cs.start_time DESC`
  ).all();
  return c.json({ sessions: results });
});

interface ParsedScheduleSession {
  className: string;
  instructorName: string | null;
  dayOfWeek: string | null; // "monday".."sunday", if the image shows a recurring weekly timetable
  date: string | null; // YYYY-MM-DD, if the image shows specific dated sessions instead
  time: string | null; // HH:MM, 24h
  durationMinutes: number | null;
}

/** Section 4 assist: admin uploads a photo of a printed/whiteboard schedule; a vision model
 * pulls out instructor names and a best-effort session list for the admin to review and edit
 * before anything is actually created (see POST /class-sessions above for the real write path). */
admin.post("/schedule-import/parse", async (c) => {
  const body = await c.req.json<{ imageBase64: string }>();
  if (!body.imageBase64) return c.json({ error: "imageBase64 is required" }, 400);

  let bytes: Uint8Array;
  try {
    const binary = atob(body.imageBase64.replace(/^data:[^,]+,/, ""));
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch {
    return c.json({ error: "imageBase64 could not be decoded" }, 400);
  }

  const prompt = `You are reading a yoga studio's class schedule from a photo (a printed timetable, a whiteboard, or a poster).
Extract every teacher name and every class session you can find. Respond with ONLY minified JSON, no prose, no markdown fences, matching exactly this shape:
{"instructors":["Name", ...],"sessions":[{"className":"...","instructorName":"Name or null","dayOfWeek":"monday|tuesday|wednesday|thursday|friday|saturday|sunday or null","date":"YYYY-MM-DD or null","time":"HH:MM in 24h or null","durationMinutes":number or null}]}
Use "dayOfWeek" when the schedule is a recurring weekly grid (e.g. a column headed "Monday"). Use "date" instead only if the image shows specific calendar dates. If duration isn't stated, estimate from the time range shown, else use null. If you truly cannot read the image, return {"instructors":[],"sessions":[]}.`;

  let response: unknown;
  try {
    const result = await c.env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
      image: Array.from(bytes),
      prompt,
      max_tokens: 2048,
    });
    response = (result as { response?: unknown }).response;
  } catch (err) {
    console.error("schedule-import AI parse failed", err);
    return c.json({ error: "Could not read that image" }, 502);
  }

  // The model usually returns `response` already parsed as an object when the prompt asks for
  // JSON, but falls back to a plain string (sometimes wrapped in prose/markdown) — handle both.
  let parsed: { instructors?: string[]; sessions?: ParsedScheduleSession[] };
  if (response && typeof response === "object") {
    parsed = response as { instructors?: string[]; sessions?: ParsedScheduleSession[] };
  } else {
    const raw = typeof response === "string" ? response : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return c.json({ error: "Could not extract a schedule from that image", raw }, 502);
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return c.json({ error: "Could not extract a schedule from that image", raw }, 502);
    }
  }

  // The model sometimes emits the literal string "null" instead of a JSON null for empty fields.
  function cleanNullish<T extends string | number | null | undefined>(v: T): T | null {
    return typeof v === "string" && v.trim().toLowerCase() === "null" ? null : v ?? null;
  }

  return c.json({
    instructors: parsed.instructors ?? [],
    sessions: (parsed.sessions ?? []).map((s) => ({
      className: s.className,
      instructorName: cleanNullish(s.instructorName),
      dayOfWeek: cleanNullish(s.dayOfWeek),
      date: cleanNullish(s.date),
      time: cleanNullish(s.time),
      durationMinutes: cleanNullish(s.durationMinutes),
    })),
  });
});

admin.post("/class-sessions", async (c) => {
  const body = await c.req.json<{
    classTypeId: number;
    instructorId?: number | null;
    startTime: string;
    endTime: string;
    capacityOverride?: number | null;
    minCapacityOverride?: number | null;
  }>();
  if (!body.classTypeId || !body.startTime || !body.endTime) {
    return c.json({ error: "classTypeId, startTime, endTime are required" }, 400);
  }
  const row = await c.env.DB.prepare(
    `INSERT INTO class_sessions (class_type_id, instructor_id, start_time, end_time, capacity_override, min_capacity_override)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
  )
    .bind(
      body.classTypeId,
      body.instructorId ?? null,
      body.startTime,
      body.endTime,
      body.capacityOverride ?? null,
      body.minCapacityOverride ?? null
    )
    .first();
  return c.json({ session: row }, 201);
});

admin.patch("/class-sessions/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Record<string, unknown>>();
  const fieldMap: Record<string, string> = {
    instructorId: "instructor_id",
    startTime: "start_time",
    endTime: "end_time",
    capacityOverride: "capacity_override",
    minCapacityOverride: "min_capacity_override",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in body) {
      sets.push(`${column} = ?`);
      values.push(body[key]);
    }
  }
  if (sets.length === 0) return c.json({ error: "No fields to update" }, 400);
  values.push(id);
  const row = await c.env.DB.prepare(`UPDATE class_sessions SET ${sets.join(", ")} WHERE id = ? RETURNING *`)
    .bind(...values)
    .first();
  if (!row) return c.json({ error: "Not found" }, 404);
  await recomputeSessionStatus(c.env, id);
  return c.json({ session: row });
});

/** Section 9: force-confirm a class (e.g. Easy Yoga) even below the normal threshold. */
admin.post("/class-sessions/:id/open-manually", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(
    "UPDATE class_sessions SET opened_manually = 1, status = CASE WHEN status = 'scheduled' THEN 'confirmed' ELSE status END WHERE id = ? RETURNING *"
  )
    .bind(id)
    .first();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ session: row });
});

/** Section 12: studio cancels a class; every confirmed booking is auto-refunded. */
admin.post("/class-sessions/:id/cancel", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ reason?: string }>().catch((): { reason?: string } => ({}));
  const user = c.get("user")!;
  const result = await studioCancel(c.env, { classSessionId: id, adminUserId: user.id, reason: body.reason });
  if (!result.ok) return c.json({ error: result.error }, (result.status ?? 400) as 400 | 404);
  return c.json(result.data);
});

admin.get("/class-sessions/:id/bookings", async (c) => {
  const id = Number(c.req.param("id"));
  const { results } = await c.env.DB.prepare(
    `SELECT b.*, u.display_name AS user_name, u.phone, p.name AS package_name
     FROM bookings b JOIN users u ON u.id = b.user_id
     LEFT JOIN member_packages mp ON mp.id = b.member_package_id
     LEFT JOIN packages p ON p.id = mp.package_id
     WHERE b.class_session_id = ? ORDER BY b.created_at ASC`
  )
    .bind(id)
    .all();
  return c.json({ bookings: results });
});

admin.get("/class-sessions/:id/waitlist", async (c) => {
  const id = Number(c.req.param("id"));
  const entries = await listWaitlistForSession(c.env, id);
  return c.json({ entries });
});

// -- Booking actions (section 10) ------------------------------------------------

admin.post("/bookings/:id/no-show", async (c) => {
  const id = Number(c.req.param("id"));
  const result = await markNoShow(c.env, id);
  if (!result.ok) return c.json({ error: result.error }, (result.status ?? 400) as 400 | 404);
  return c.json(result.data);
});

admin.post("/bookings/:id/attended", async (c) => {
  const id = Number(c.req.param("id"));
  const result = await markAttended(c.env, id);
  if (!result.ok) return c.json({ error: result.error }, (result.status ?? 400) as 400 | 404);
  return c.json(result.data ?? { ok: true });
});

admin.post("/bookings/:id/cancel", async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user")!;
  const result = await cancelBooking(c.env, { bookingId: id, actingUserId: user.id, isAdmin: true });
  if (!result.ok) return c.json({ error: result.error }, (result.status ?? 400) as 400 | 403 | 404);
  return c.json(result.data);
});

// -- Instructors ------------------------------------------------------------------

admin.get("/instructors", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM instructors ORDER BY name ASC").all();
  return c.json({ instructors: results });
});

admin.post("/instructors", async (c) => {
  const body = await c.req.json<{ name: string; bio?: string; photoUrl?: string }>();
  if (!body.name) return c.json({ error: "name is required" }, 400);
  const row = await c.env.DB.prepare("INSERT INTO instructors (name, bio, photo_url) VALUES (?, ?, ?) RETURNING *")
    .bind(body.name, body.bio ?? null, body.photoUrl ?? null)
    .first();
  return c.json({ instructor: row }, 201);
});

// -- Members (section 2) -----------------------------------------------------------

admin.get("/members", async (c) => {
  const search = c.req.query("search");
  const query = search
    ? c.env.DB.prepare(
        `SELECT id, line_user_id, display_name, phone, date_of_birth, role, created_at FROM users
         WHERE display_name LIKE ? OR phone LIKE ? ORDER BY display_name ASC LIMIT 100`
      ).bind(`%${search}%`, `%${search}%`)
    : c.env.DB.prepare(
        "SELECT id, line_user_id, display_name, phone, date_of_birth, role, created_at FROM users ORDER BY created_at DESC LIMIT 100"
      );
  const { results } = await query.all();
  return c.json({ members: results });
});

admin.post("/members", async (c) => {
  const body = await c.req.json<{ displayName: string; phone?: string; dateOfBirth?: string; notes?: string }>();
  if (!body.displayName) return c.json({ error: "displayName is required" }, 400);
  const row = await c.env.DB.prepare(
    "INSERT INTO users (display_name, phone, date_of_birth, notes, role) VALUES (?, ?, ?, ?, 'customer') RETURNING *"
  )
    .bind(body.displayName, body.phone ?? null, body.dateOfBirth ?? null, body.notes ?? null)
    .first();
  return c.json({ member: row }, 201);
});

admin.get("/members/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const member = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  if (!member) return c.json({ error: "Not found" }, 404);

  const { results: memberPackages } = await c.env.DB.prepare(
    `SELECT mp.*, p.name AS package_name FROM member_packages mp JOIN packages p ON p.id = mp.package_id
     WHERE mp.user_id = ? ORDER BY mp.purchased_at DESC`
  )
    .bind(id)
    .all();
  const { results: bookingHistory } = await c.env.DB.prepare(
    `SELECT b.id, b.status, b.created_at, ct.name AS class_name, cs.start_time
     FROM bookings b JOIN class_sessions cs ON cs.id = b.class_session_id JOIN class_types ct ON ct.id = cs.class_type_id
     WHERE b.user_id = ? ORDER BY cs.start_time DESC LIMIT 100`
  )
    .bind(id)
    .all();
  const birthdayCoupons = await listBirthdayCouponsForUser(c.env, id);
  const { results: renewalHistory } = await c.env.DB.prepare(
    `SELECT pr.* FROM package_renewals pr
     JOIN member_packages mp ON mp.id = pr.old_member_package_id
     WHERE mp.user_id = ? ORDER BY pr.created_at DESC`
  )
    .bind(id)
    .all();

  return c.json({ member, memberPackages, bookingHistory, birthdayCoupons, renewalHistory });
});

admin.patch("/members/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Record<string, unknown>>();
  const fieldMap: Record<string, string> = {
    displayName: "display_name",
    phone: "phone",
    dateOfBirth: "date_of_birth",
    notes: "notes",
    role: "role",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in body) {
      sets.push(`${column} = ?`);
      values.push(body[key]);
    }
  }
  if (sets.length === 0) return c.json({ error: "No fields to update" }, 400);
  values.push(id);
  const row = await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ? RETURNING *`)
    .bind(...values)
    .first();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ member: row });
});

/** Section 16: admin issues a birthday coupon to a member. */
admin.post("/members/:id/birthday-coupon", async (c) => {
  const id = Number(c.req.param("id"));
  const coupon = await issueBirthdayCoupon(c.env, id);
  return c.json({ coupon }, 201);
});

// -- Package catalog (section 3) --------------------------------------------------

admin.get("/packages", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM packages ORDER BY sort_order ASC").all();
  return c.json({ packages: results });
});

admin.post("/packages", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.name || body.priceCents == null) return c.json({ error: "name and priceCents are required" }, 400);
  const row = await c.env.DB.prepare(
    `INSERT INTO packages
       (name, price_cents, currency, credits, validity_value, validity_unit, eligible_class_type_ids,
        eligible_days, max_bookings_per_day, renewable, shared, one_time_per_person, active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  )
    .bind(
      body.name,
      body.priceCents,
      body.currency ?? "THB",
      body.credits ?? null,
      body.validityValue ?? null,
      body.validityUnit ?? "month",
      body.eligibleClassTypeIds ? JSON.stringify(body.eligibleClassTypeIds) : null,
      body.eligibleDays ? JSON.stringify(body.eligibleDays) : null,
      body.maxBookingsPerDay ?? null,
      body.renewable ? 1 : 0,
      body.shared ? 1 : 0,
      body.oneTimePerPerson ? 1 : 0,
      body.active === false ? 0 : 1,
      body.sortOrder ?? 0
    )
    .first();
  return c.json({ package: row }, 201);
});

admin.patch("/packages/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Record<string, unknown>>();
  const fieldMap: Record<string, string> = {
    name: "name",
    priceCents: "price_cents",
    currency: "currency",
    credits: "credits",
    validityValue: "validity_value",
    validityUnit: "validity_unit",
    maxBookingsPerDay: "max_bookings_per_day",
    renewable: "renewable",
    shared: "shared",
    oneTimePerPerson: "one_time_per_person",
    active: "active",
    sortOrder: "sort_order",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in body) {
      sets.push(`${column} = ?`);
      values.push(body[key]);
    }
  }
  if ("eligibleClassTypeIds" in body) {
    sets.push("eligible_class_type_ids = ?");
    values.push(body.eligibleClassTypeIds ? JSON.stringify(body.eligibleClassTypeIds) : null);
  }
  if ("eligibleDays" in body) {
    sets.push("eligible_days = ?");
    values.push(body.eligibleDays ? JSON.stringify(body.eligibleDays) : null);
  }
  if (sets.length === 0) return c.json({ error: "No fields to update" }, 400);
  values.push(id);
  const row = await c.env.DB.prepare(`UPDATE packages SET ${sets.join(", ")} WHERE id = ? RETURNING *`)
    .bind(...values)
    .first();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ package: row });
});

// -- Member packages: manual grants, expiry extensions, renewals (sections 3, 13, 17-18) --

admin.get("/member-packages", async (c) => {
  const userId = c.req.query("userId");
  const status = c.req.query("status");
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (userId) {
    clauses.push("mp.user_id = ?");
    values.push(Number(userId));
  }
  if (status) {
    clauses.push("mp.status = ?");
    values.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { results } = await c.env.DB.prepare(
    `SELECT mp.*, p.name AS package_name, u.display_name AS user_name
     FROM member_packages mp JOIN packages p ON p.id = mp.package_id JOIN users u ON u.id = mp.user_id
     ${where} ORDER BY mp.purchased_at DESC LIMIT 200`
  )
    .bind(...values)
    .all();
  return c.json({ memberPackages: results });
});

/** Admin manually grants a package to a member (walk-in / cash / comp), marked paid immediately. */
admin.post("/member-packages", async (c) => {
  const body = await c.req.json<{ userId: number; packageId: number; markPaid?: boolean }>();
  if (!Number.isInteger(body.userId) || !Number.isInteger(body.packageId)) {
    return c.json({ error: "userId and packageId are required" }, 400);
  }
  const pkg = await getPackage(c.env, body.packageId);
  if (!pkg) return c.json({ error: "Package not found" }, 404);

  const mp = await createPendingMemberPackage(c.env, body.userId, pkg);
  if (body.markPaid !== false) {
    await c.env.DB.prepare(
      "INSERT INTO payments (member_package_id, provider, amount_cents, currency, status, updated_at) VALUES (?, 'cash', ?, ?, 'succeeded', datetime('now'))"
    )
      .bind(mp.id, pkg.price_cents, pkg.currency)
      .run();
    await activateMemberPackage(c.env, mp.id);
  }
  const fresh = await getMemberPackage(c.env, mp.id);
  return c.json({ memberPackage: fresh }, 201);
});

admin.get("/member-packages/expiry-extension-flags", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT mp.*, p.name AS package_name, u.display_name AS user_name
     FROM member_packages mp JOIN packages p ON p.id = mp.package_id JOIN users u ON u.id = mp.user_id
     WHERE mp.expiry_extension_flagged_at IS NOT NULL AND mp.status = 'active'
     ORDER BY mp.expiry_extension_flagged_at ASC`
  ).all();
  return c.json({ flagged: results });
});

/** Section 13: admin manually extends expiry after 2 studio-cancelled classes on this package. */
admin.post("/member-packages/:id/extend-expiry", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ newExpiresAt: string; reason?: string }>();
  if (!body.newExpiresAt) return c.json({ error: "newExpiresAt is required" }, 400);
  const user = c.get("user")!;

  const mp = await getMemberPackage(c.env, id);
  if (!mp) return c.json({ error: "Not found" }, 404);

  await c.env.DB.prepare(
    "INSERT INTO expiry_extensions (member_package_id, old_expires_at, new_expires_at, reason, admin_user_id) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(id, mp.expires_at, body.newExpiresAt, body.reason ?? null, user.id)
    .run();
  const row = await c.env.DB.prepare(
    "UPDATE member_packages SET expires_at = ?, expiry_extension_flagged_at = NULL WHERE id = ? RETURNING *"
  )
    .bind(body.newExpiresAt, id)
    .first();
  return c.json({ memberPackage: row });
});

admin.get("/member-packages/:id/renewals", async (c) => {
  const id = Number(c.req.param("id"));
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM package_renewals WHERE old_member_package_id = ? OR new_member_package_id = ? ORDER BY created_at DESC"
  )
    .bind(id, id)
    .all();
  return c.json({ renewals: results });
});

/** Admin-processed renewals: skip Omise, mark the fee collected in cash and apply immediately. */
admin.post("/member-packages/:id/renewals/extend", async (c) => {
  const id = Number(c.req.param("id"));
  const result = await createExtendRenewalRequest(c.env, { memberPackageId: id, processedBy: "admin" });
  if (!result.ok) return c.json({ error: result.error }, (result.status ?? 400) as 400 | 404);
  await c.env.DB.prepare(
    "INSERT INTO payments (package_renewal_id, provider, amount_cents, currency, status, updated_at) VALUES (?, 'cash', ?, 'THB', 'succeeded', datetime('now'))"
  )
    .bind(result.data!.renewalId, result.data!.feeCents)
    .run();
  await applyExtendRenewal(c.env, result.data!.renewalId);
  return c.json(result.data);
});

/** Unified queue of manual-PromptPay payments awaiting a human to confirm (no bank API yet). */
admin.get("/pending-payments", async (c) => {
  const { results: packageRows } = await c.env.DB.prepare(
    `SELECT mp.id, u.display_name AS user_name, p.name AS description, mp.price_paid_cents AS amount_cents,
            mp.currency, mp.purchased_at AS created_at
     FROM member_packages mp JOIN users u ON u.id = mp.user_id JOIN packages p ON p.id = mp.package_id
     WHERE mp.status = 'pending_payment' ORDER BY mp.purchased_at ASC`
  ).all<{ id: number; user_name: string; description: string; amount_cents: number; currency: string; created_at: string }>();

  const { results: renewalRows } = await c.env.DB.prepare(
    `SELECT pr.id, u.display_name AS user_name, 'Package extension' AS description, pr.fee_cents AS amount_cents,
            'THB' AS currency, pr.created_at
     FROM package_renewals pr
     JOIN member_packages mp ON mp.id = pr.old_member_package_id
     JOIN users u ON u.id = mp.user_id
     WHERE pr.status = 'pending' AND pr.option = 'extend' ORDER BY pr.created_at ASC`
  ).all<{ id: number; user_name: string; description: string; amount_cents: number; currency: string; created_at: string }>();

  return c.json({
    pending: [
      ...packageRows.map((r) => ({ kind: "package" as const, ...r })),
      ...renewalRows.map((r) => ({ kind: "renewal" as const, ...r })),
    ].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  });
});

/** Confirms a member-initiated PromptPay payment manually (no live bank integration yet):
 * admin checks their banking app, then activates the package here. */
admin.post("/member-packages/:id/mark-paid", async (c) => {
  const id = Number(c.req.param("id"));
  const mp = await getMemberPackage(c.env, id);
  if (!mp) return c.json({ error: "Not found" }, 404);
  if (mp.status !== "pending_payment") return c.json({ error: `Already ${mp.status}` }, 409);

  await c.env.DB.prepare(
    "INSERT INTO payments (member_package_id, provider, amount_cents, currency, status, updated_at) VALUES (?, 'promptpay_manual', ?, ?, 'succeeded', datetime('now'))"
  )
    .bind(id, mp.price_paid_cents, mp.currency)
    .run();
  await activateMemberPackage(c.env, id);

  const user = await c.env.DB.prepare("SELECT line_user_id FROM users WHERE id = ?")
    .bind(mp.user_id)
    .first<{ line_user_id: string | null }>();
  if (user?.line_user_id) {
    await pushLineMessage(c.env, user.line_user_id, "✅ Payment confirmed — your package is now active!");
  }

  const fresh = await getMemberPackage(c.env, id);
  return c.json({ memberPackage: fresh });
});

/** Confirms a member-initiated renewal-extension PromptPay fee manually. */
admin.post("/renewals/:id/mark-paid", async (c) => {
  const id = Number(c.req.param("id"));
  const renewal = await c.env.DB.prepare(
    `SELECT pr.status, pr.fee_cents, mp.user_id FROM package_renewals pr
     JOIN member_packages mp ON mp.id = pr.old_member_package_id WHERE pr.id = ?`
  )
    .bind(id)
    .first<{ status: string; fee_cents: number | null; user_id: number }>();
  if (!renewal) return c.json({ error: "Not found" }, 404);
  if (renewal.status !== "pending") return c.json({ error: `Already ${renewal.status}` }, 409);

  await c.env.DB.prepare(
    "INSERT INTO payments (package_renewal_id, provider, amount_cents, currency, status, updated_at) VALUES (?, 'promptpay_manual', ?, 'THB', 'succeeded', datetime('now'))"
  )
    .bind(id, renewal.fee_cents ?? 0)
    .run();
  await applyExtendRenewal(c.env, id);

  const user = await c.env.DB.prepare("SELECT line_user_id FROM users WHERE id = ?")
    .bind(renewal.user_id)
    .first<{ line_user_id: string | null }>();
  if (user?.line_user_id) {
    await pushLineMessage(c.env, user.line_user_id, "✅ Payment confirmed — your package extension is now active!");
  }

  return c.json({ ok: true });
});

admin.post("/member-packages/:id/activate", async (c) => {
  const id = Number(c.req.param("id"));
  const result = await activateAndMaybeCombine(c.env, id, "admin");
  if (!result.ok) return c.json({ error: result.error }, (result.status ?? 400) as 400 | 404);
  return c.json(result.data);
});

// -- Shared coupon pools (section 14) ---------------------------------------------

admin.get("/member-packages/:id/shared-members", async (c) => {
  const id = Number(c.req.param("id"));
  const members = await listSharedCouponMembers(c.env, id);
  return c.json({ members });
});

admin.post("/member-packages/:id/shared-members", async (c) => {
  const id = Number(c.req.param("id"));
  const { userId } = await c.req.json<{ userId: number }>();
  if (!Number.isInteger(userId)) return c.json({ error: "userId is required" }, 400);
  await addSharedCouponMember(c.env, id, userId);
  return c.json({ ok: true }, 201);
});

admin.delete("/member-packages/:id/shared-members/:userId", async (c) => {
  const id = Number(c.req.param("id"));
  const userId = Number(c.req.param("userId"));
  await removeSharedCouponMember(c.env, id, userId);
  return c.json({ ok: true });
});

admin.get("/member-packages/:id/shared-usage", async (c) => {
  const id = Number(c.req.param("id"));
  const usage = await listSharedCouponUsage(c.env, id);
  return c.json({ usage });
});

// -- Holiday calendar (section 8) ------------------------------------------------

admin.get("/holidays", async (c) => {
  const holidays = await listHolidays(c.env);
  return c.json({ holidays });
});

admin.post("/holidays", async (c) => {
  const body = await c.req.json<{ date: string; name: string; type?: "public" | "special" }>();
  if (!body.date || !body.name) return c.json({ error: "date and name are required" }, 400);
  const holiday = await addHoliday(c.env, body.date, body.name, body.type ?? "public");
  return c.json({ holiday }, 201);
});

admin.patch("/holidays/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ date?: string; name?: string; type?: "public" | "special" }>();
  const holiday = await updateHoliday(c.env, id, body);
  if (!holiday) return c.json({ error: "Not found" }, 404);
  return c.json({ holiday });
});

admin.delete("/holidays/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!(await getHoliday(c.env, id))) return c.json({ error: "Not found" }, 404);
  await removeHoliday(c.env, id);
  return c.json({ ok: true });
});

// -- Configurable business-rule settings (section 1) ------------------------------

admin.get("/settings", async (c) => {
  const settings = await getAllSettings(c.env);
  return c.json({ settings });
});

admin.patch("/settings", async (c) => {
  const body = await c.req.json<Record<string, string>>();
  for (const [key, value] of Object.entries(body)) {
    await setSetting(c.env, key as SettingKey, String(value));
  }
  const settings = await getAllSettings(c.env);
  return c.json({ settings });
});

// -- Read-only rollups ---------------------------------------------------------

admin.get("/bookings", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT b.id, b.status, b.created_at, u.display_name AS user_name,
            ct.name AS class_name, cs.start_time
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     JOIN class_sessions cs ON cs.id = b.class_session_id
     JOIN class_types ct ON ct.id = cs.class_type_id
     ORDER BY b.created_at DESC LIMIT 200`
  ).all();
  return c.json({ bookings: results });
});

admin.get("/payments", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, u.display_name AS user_name,
            mp_pkg.name AS package_name, renewal_mp.user_id AS renewal_user_id
     FROM payments p
     LEFT JOIN member_packages mp ON mp.id = p.member_package_id
     LEFT JOIN packages mp_pkg ON mp_pkg.id = mp.package_id
     LEFT JOIN package_renewals pr ON pr.id = p.package_renewal_id
     LEFT JOIN member_packages renewal_mp ON renewal_mp.id = pr.old_member_package_id
     LEFT JOIN users u ON u.id = COALESCE(mp.user_id, renewal_mp.user_id)
     ORDER BY p.created_at DESC LIMIT 200`
  ).all();
  return c.json({ payments: results });
});

export default admin;
