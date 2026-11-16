import type { Env } from "../env.d.ts";
import { dateOnlyInTz } from "./holidays.ts";
import { pushLineMessage } from "./line.ts";
import { formatDateForMessage } from "./dateFormat.ts";

/** Reminders go out from this studio-local hour onward, so nobody gets pinged at midnight.
 * Any cron run later that day still sends what's due (each reminder is sent once). */
const SEND_FROM_LOCAL_HOUR = 9;

type ReminderKind = "3_days" | "last_day";

interface ExpiringPackage {
  id: number;
  user_id: number;
  line_user_id: string;
  package_name: string;
  credits_total: number | null;
  credits_used: number;
  expires_at: string;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function localHour(now: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
}

function creditsLeftText(p: ExpiringPackage): string {
  if (p.credits_total == null) return "";
  const left = Math.max(0, p.credits_total - p.credits_used);
  return ` (${left} ${left === 1 ? "class" : "classes"} left)`;
}

function buildMessage(kind: ReminderKind, expiryDate: string, pkgs: ExpiringPackage[]): string {
  const date = formatDateForMessage(expiryDate);
  if (pkgs.length === 1) {
    const p = pkgs[0];
    return kind === "3_days"
      ? `⏰ Reminder: your package "${p.package_name}"${creditsLeftText(p)} expires in 3 days. ` +
          `The last day you can use it is ${date}. Book your classes before then!`
      : `⏳ Today (${date}) is the last day you can use your package "${p.package_name}"${creditsLeftText(p)}. ` +
          `After today it will expire.`;
  }
  const list = pkgs.map((p) => `• ${p.package_name}${creditsLeftText(p)}`).join("\n");
  return kind === "3_days"
    ? `⏰ Reminder: these packages expire in 3 days. The last day you can use them is ${date}.\n${list}\nBook your classes before then!`
    : `⏳ Today (${date}) is the last day you can use these packages:\n${list}\nAfter today they will expire.`;
}

/** Cron: LINE reminders to members whose active packages expire in 3 days, or today (Thailand time).
 * Packages with no classes left, and members without a LINE login, are skipped. A member with several
 * packages expiring the same day gets one message naming each of them. */
export async function sendPackageExpiryReminders(env: Env, now = new Date()): Promise<number> {
  if (localHour(now, env.TIMEZONE) < SEND_FROM_LOCAL_HOUR) return 0;

  const today = dateOnlyInTz(now.toISOString(), env.TIMEZONE);
  const targets: Record<ReminderKind, string> = { "3_days": addDays(today, 3), last_day: today };

  // Coarse UTC window in SQL; the exact Thailand-date match happens below.
  const { results } = await env.DB.prepare(
    `SELECT mp.id, mp.user_id, u.line_user_id, p.name AS package_name,
            mp.credits_total, mp.credits_used, mp.expires_at
     FROM member_packages mp
     JOIN packages p ON p.id = mp.package_id
     JOIN users u ON u.id = mp.user_id
     WHERE mp.status = 'active'
       AND mp.expires_at IS NOT NULL AND mp.expires_at >= ? AND mp.expires_at < ?
       AND (mp.credits_total IS NULL OR mp.credits_used < mp.credits_total)
       AND u.line_user_id IS NOT NULL
     ORDER BY mp.expires_at ASC, mp.id ASC`
  )
    .bind(new Date(now.getTime() - 86_400_000).toISOString(), new Date(now.getTime() + 5 * 86_400_000).toISOString())
    .all<ExpiringPackage>();

  // Group by member + reminder kind, so each member gets at most one message per kind per day.
  const groups = new Map<string, { kind: ReminderKind; pkgs: ExpiringPackage[] }>();
  for (const p of results) {
    if (new Date(p.expires_at).getTime() <= now.getTime()) continue;
    const expiryDate = dateOnlyInTz(p.expires_at, env.TIMEZONE);
    const kind = (Object.keys(targets) as ReminderKind[]).find((k) => targets[k] === expiryDate);
    if (!kind) continue;
    const key = `${p.user_id}:${kind}`;
    const group = groups.get(key) ?? { kind, pkgs: [] };
    group.pkgs.push(p);
    groups.set(key, group);
  }

  let sent = 0;
  for (const { kind, pkgs } of groups.values()) {
    const expiryDate = targets[kind];
    // Claim each reminder before sending, so overlapping cron runs can't double-send.
    const claimed: ExpiringPackage[] = [];
    for (const p of pkgs) {
      const res = await env.DB.prepare(
        "INSERT OR IGNORE INTO package_expiry_reminders (member_package_id, kind, expiry_date) VALUES (?, ?, ?)"
      )
        .bind(p.id, kind, expiryDate)
        .run();
      if (res.meta.changes) claimed.push(p);
    }
    if (claimed.length === 0) continue;

    const ok = await pushLineMessage(env, claimed[0].line_user_id, buildMessage(kind, expiryDate, claimed));
    if (ok) {
      sent++;
    } else {
      // Release the claims so a later cron run today retries.
      for (const p of claimed) {
        await env.DB.prepare("DELETE FROM package_expiry_reminders WHERE member_package_id = ? AND kind = ? AND expiry_date = ?")
          .bind(p.id, kind, expiryDate)
          .run();
      }
    }
  }
  return sent;
}
