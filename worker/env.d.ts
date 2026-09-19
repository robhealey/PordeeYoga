export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AI: Ai;

  // vars (wrangler.jsonc `vars`)
  ENVIRONMENT: string;
  DEV_MOCK_AUTH: string;
  STUDIO_NAME: string;
  TIMEZONE: string;
  BOOKING_EXPIRY_MINUTES: string;
  REMINDER_HOURS_BEFORE: string;

  // secrets (set via `wrangler secret put`, see worker/.dev.vars.example for local dev)
  LINE_LOGIN_CHANNEL_ID?: string;
  LINE_LOGIN_CHANNEL_SECRET?: string;
  LIFF_ID?: string;
  LINE_MESSAGING_CHANNEL_ACCESS_TOKEN?: string;
  LINE_MESSAGING_CHANNEL_SECRET?: string;
  OMISE_SECRET_KEY?: string;
  OMISE_WEBHOOK_SECRET?: string;
  // Comma-separated real LINE user ids (the opaque `sub` from LINE's ID token, e.g. "U10a04...")
  // of the studio owner(s). Those accounts are force-synced to role='admin' on every login —
  // see upsertLineUser.
  OWNER_LINE_USER_IDS?: string;
}
