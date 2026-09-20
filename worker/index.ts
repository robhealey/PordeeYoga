import { Hono } from "hono";
import type { AppEnv } from "./types.ts";
import auth from "./routes/auth.ts";
import classes from "./routes/classes.ts";
import bookings from "./routes/bookings.ts";
import packages from "./routes/packages.ts";
import waitlist from "./routes/waitlist.ts";
import payments from "./routes/payments.ts";
import admin from "./routes/admin.ts";
import webhooks from "./routes/webhooks.ts";
import { pushLineMessage } from "./lib/line.ts";
import { expireStaleNotifications } from "./lib/waitlist.ts";
import { getRenewalGraceDays } from "./lib/renewals.ts";
import type { Env } from "./env.d.ts";

const app = new Hono<AppEnv>();

app.route("/api/auth", auth);
app.route("/api/classes", classes);
app.route("/api/bookings", bookings);
app.route("/api/packages", packages);
app.route("/api/waitlist", waitlist);
app.route("/api/payments", payments);
app.route("/api/admin", admin);
app.route("/api/webhooks", webhooks);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

/** Abandoned package purchases (Omise charge never completed) don't hold a spot on anything,
 * but we still clear them out after a while so they don't linger in a member's package list. */
async function expireStalePendingPurchases(env: Env): Promise<number> {
  const minutes = Number(env.BOOKING_EXPIRY_MINUTES) || 15;
  const result = await env.DB.prepare(
    `UPDATE member_packages SET status = 'cancelled'
     WHERE status = 'pending_payment' AND combined_from_member_package_id IS NULL
       AND purchased_at < datetime('now', ?)`
  )
    .bind(`-${minutes} minutes`)
    .run();

  // Renewal purchases (rolling over an old package) and extension fees stay open until the
  // payment deadline — a number of days after the OLD package's expiry — then lapse.
  const graceDays = await getRenewalGraceDays(env);
  const lapsedPurchases = await env.DB.prepare(
    `UPDATE member_packages SET status = 'cancelled'
     WHERE status = 'pending_payment' AND combined_from_member_package_id IS NOT NULL
       AND (SELECT datetime(old.expires_at, ?) FROM member_packages old WHERE old.id = member_packages.combined_from_member_package_id) < datetime('now')`
  )
    .bind(`+${graceDays} days`)
    .run();
  const lapsedExtensions = await env.DB.prepare(
    `UPDATE package_renewals SET status = 'cancelled'
     WHERE status = 'pending' AND option = 'extend' AND datetime(old_expires_at, ?) < datetime('now')`
  )
    .bind(`+${graceDays} days`)
    .run();
  return (result.meta.changes ?? 0) + (lapsedPurchases.meta.changes ?? 0) + (lapsedExtensions.meta.changes ?? 0);
}

/** Section 3: packages expire once their validity window passes, freeing any lingering credits. */
async function expirePastDuePackages(env: Env): Promise<number> {
  const result = await env.DB.prepare(
    `UPDATE member_packages SET status = 'expired'
     WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < datetime('now')`
  ).run();
  return result.meta.changes ?? 0;
}

async function sendUpcomingClassReminders(env: Env): Promise<number> {
  const hours = Number(env.REMINDER_HOURS_BEFORE) || 2;
  const { results } = await env.DB.prepare(
    `SELECT b.id AS booking_id, u.line_user_id, ct.name AS class_name, cs.start_time
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     JOIN class_sessions cs ON cs.id = b.class_session_id
     JOIN class_types ct ON ct.id = cs.class_type_id
     WHERE b.status = 'confirmed'
       AND b.reminder_sent_at IS NULL
       AND cs.start_time BETWEEN datetime('now', ?) AND datetime('now', ?, '+15 minutes')`
  )
    .bind(`+${hours} hours`, `+${hours} hours`)
    .all<{ booking_id: number; line_user_id: string | null; class_name: string; start_time: string }>();

  for (const row of results) {
    if (!row.line_user_id) continue;
    const when = new Date(row.start_time).toLocaleString("en-US", {
      timeZone: env.TIMEZONE,
      timeStyle: "short",
    });
    await pushLineMessage(env, row.line_user_id, `⏰ Reminder: ${row.class_name} starts today at ${when}.`);
    await env.DB.prepare("UPDATE bookings SET reminder_sent_at = datetime('now') WHERE id = ?")
      .bind(row.booking_id)
      .run();
  }
  return results.length;
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        const expiredPurchases = await expireStalePendingPurchases(env);
        const expiredPackages = await expirePastDuePackages(env);
        const waitlistExpired = await expireStaleNotifications(env);
        const reminded = await sendUpcomingClassReminders(env);
        console.log(
          `cron: expired ${expiredPurchases} pending purchases, ${expiredPackages} past-due packages, ` +
            `${waitlistExpired} stale waitlist claims, sent ${reminded} reminders`
        );
      })()
    );
  },
};
