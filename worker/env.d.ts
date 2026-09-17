export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

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
  OMISE_PUBLIC_KEY?: string;
  OMISE_SECRET_KEY?: string;
  OMISE_WEBHOOK_SECRET?: string;
}
