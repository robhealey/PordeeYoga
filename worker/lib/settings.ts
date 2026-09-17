import type { Env } from "../env.d.ts";

/** Admin-configurable business-rule knobs (section 1: rules should change without code changes). */
export type SettingKey =
  | "booking_window_days"
  | "late_cancel_window_minutes"
  | "default_min_class_capacity"
  | "default_max_class_capacity"
  | "waitlist_claim_minutes"
  | "renewal_extend_fee_cents"
  | "renewal_extend_months"
  | "renewal_combine_activation_window_months"
  | "birthday_coupon_validity_months"
  | "studio_cancellations_for_extension_eligibility";

export async function getSetting(env: Env, key: SettingKey): Promise<string> {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  if (!row) throw new Error(`Missing app_settings key: ${key}`);
  return row.value;
}

export async function getSettingNumber(env: Env, key: SettingKey): Promise<number> {
  return Number(await getSetting(env, key));
}

export async function getAllSettings(env: Env): Promise<Record<string, string>> {
  const { results } = await env.DB.prepare("SELECT key, value FROM app_settings ORDER BY key").all<{
    key: string;
    value: string;
  }>();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}

export async function setSetting(env: Env, key: SettingKey, value: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE key = ?"
  )
    .bind(value, key)
    .run();
}
