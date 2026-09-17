# Pordee Yoga

Studio management website implementing Pordee Yoga's full booking/membership business rules: LINE
sign-in, packages & credits, class booking with a member-selected package, waitlists, cancellations,
studio cancellations, shared coupon pools, birthday coupons, package renewals, and an admin console —
built on Cloudflare Workers + D1. Payment (Omise: cards + PromptPay QR) is per package purchase /
renewal fee, not per class.

## Stack

- **Backend**: Hono on Cloudflare Workers (`worker/`)
- **Database**: Cloudflare D1 (`worker/migrations/`)
- **Frontend**: React + Vite + Tailwind (`frontend/`), served by the same Worker as static assets
- **Auth**: LINE Login (LIFF inside the LINE app, OAuth redirect in a plain browser)
- **Payments**: Omise (cards + PromptPay QR), pluggable for LINE Pay later
- **Messaging**: LINE Messaging API (booking confirmations + class reminders)

## Local development

```bash
npm install
npm --prefix frontend install
npx wrangler d1 migrations apply pordee-yoga-db --local
npm run dev   # runs the Worker (8787) and the Vite dev server (5173) together
```

Open http://localhost:5173. In dev, `VITE_LINE_LOGIN_CHANNEL_ID` and `VITE_LIFF_ID` can be left blank —
the "Log in with LINE" button falls back to a mock login (gated by `DEV_MOCK_AUTH` in `wrangler.jsonc`),
and there's a "(dev: log in as admin)" shortcut in the header. See `.dev.vars.example` and
`frontend/.env.example` for the full list of variables and how to plug in real credentials once
you have them.

## Setup checklist (LINE + Omise)

Both give free instant *test* credentials — no business verification needed to build and demo the whole flow.

1. **LINE Developers** (https://developers.line.biz/console/): create a Provider → a **LINE Login**
   channel (grab the Channel ID/Secret, add a LIFF app under it and grab the LIFF ID) → a
   **Messaging API** channel (grab the Channel Access Token + Channel Secret). Point the Messaging
   API webhook URL at `https://<your-worker-domain>/api/webhooks/line`.
2. **Omise** (https://dashboard.omise.co/signup): sign up, switch to **Test** mode, grab the
   Public/Secret test keys. Point the webhook URL (Omise dashboard → Webhooks) at
   `https://<your-worker-domain>/api/webhooks/omise`.
3. Copy `.dev.vars.example` → `.dev.vars` and `frontend/.env.example` → `frontend/.env.local`,
   fill in what you have.
4. For a real deploy: `wrangler login`, `wrangler d1 create pordee-yoga-db` (paste the returned
   `database_id` into `wrangler.jsonc`), then `wrangler secret put <NAME>` for each secret in
   `worker/env.d.ts`, then `npm run deploy`.

## Data model

`worker/migrations/0001_init.sql` has the v1 core (users, instructors, class_types, class_sessions,
bookings, payments, sessions). `worker/migrations/0002_packages_and_booking_rules.sql` adds the full
membership system: `packages` (catalog, seeded from the owner's price list) + `member_packages`
(a member's purchased credits/expiry), `holidays`, `waitlist_entries`, `shared_coupon_members`,
`birthday_coupons`, `package_renewals`, `expiry_extensions`, and `app_settings` (admin-editable
business-rule knobs — booking window, late-cancellation window, fees, etc., see `worker/lib/settings.ts`).
Business logic lives in `worker/lib/` (`packages.ts`, `bookings.ts`, `waitlist.ts`, `renewals.ts`,
`coupons.ts`, `holidays.ts`) rather than in the route handlers.

## Scheduled jobs

A cron trigger (every 15 min, see `triggers.crons` in `wrangler.jsonc`) expires abandoned package
purchases and past-due packages, expires unclaimed waitlist offers (cascading to the next person),
and sends LINE reminders `REMINDER_HOURS_BEFORE` a class starts.
