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
import { expireStaleNotifications } from "./lib/waitlist.ts";
import { getRenewalGraceDays } from "./lib/renewals.ts";
import { startPackagesPastActivationDeadline } from "./lib/packages.ts";
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

  // Renewal purchases (rolling over an old package) stay open until the
  // payment deadline — a number of days after the OLD package's expiry — then lapse.
  const graceDays = await getRenewalGraceDays(env);
  const lapsedPurchases = await env.DB.prepare(
    `UPDATE member_packages SET status = 'cancelled'
     WHERE status = 'pending_payment' AND combined_from_member_package_id IS NOT NULL
       AND (SELECT datetime(old.expires_at, ?) FROM member_packages old WHERE old.id = member_packages.combined_from_member_package_id) < datetime('now')`
  )
    .bind(`+${graceDays} days`)
    .run();
  return (result.meta.changes ?? 0) + (lapsedPurchases.meta.changes ?? 0);
}

/** Section 3: packages expire once their validity window passes, freeing any lingering credits. */
async function expirePastDuePackages(env: Env): Promise<number> {
  const result = await env.DB.prepare(
    `UPDATE member_packages SET status = 'expired'
     WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < datetime('now')`
  ).run();
  return result.meta.changes ?? 0;
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        const expiredPurchases = await expireStalePendingPurchases(env);
        const startedPackages = await startPackagesPastActivationDeadline(env);
        const expiredPackages = await expirePastDuePackages(env);
        const waitlistExpired = await expireStaleNotifications(env);
        console.log(
          `cron: expired ${expiredPurchases} pending purchases, started ${startedPackages} packages past activation deadline, ` +
            `expired ${expiredPackages} past-due packages, ` +
            `${waitlistExpired} stale waitlist claims`
        );
      })()
    );
  },
};
