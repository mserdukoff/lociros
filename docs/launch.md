# Go-live checklist

Everything that has to be true before Lociros takes its first live payment. Work top to bottom; each line links to where it is explained. Hosting is unchanged: Vercel (frontend and admin), Supabase (Postgres and Auth), FastAPI in Docker on the Lightsail 4 GB box behind Caddy.

## 1. Stripe in test mode

- [ ] Product **Lociros** with a monthly and an annual price in **test** mode ([deploy §5](deploy.md#5-stripe)).
- [ ] Test webhook endpoint on the preview or production URL with the eight events listed in deploy §5.
- [ ] API env on a staging run: `sk_test_…`, test `whsec_…`, test price ids.
- [ ] Walk the funnel by hand on a phone and a laptop:
  - [ ] Guest: placement, first passage, the second passage shows the sign-up screen.
  - [ ] Sign up: the shelf shows "7 days left in your free week."
  - [ ] `/pricing` → annual → Checkout with `4242 4242 4242 4242` → `/billing/success` turns into "You're subscribed" within a few seconds.
  - [ ] The first charge date in Stripe is the end of the free week, not today.
  - [ ] Settings → **Manage billing** opens the portal; switch plan; cancel; the shelf still opens until the period ends.
  - [ ] `4000 0000 0000 0341` (fails on renewal): use a Stripe test clock to advance past the trial; the account shows the payment-failing notice and still reads.
  - [ ] Advance the test clock past the retries; the subscription ends and the paywall returns.
  - [ ] Checkout **Back** returns to `/pricing?canceled=1` with "Nothing was charged."
  - [ ] Settings → **Delete account** while subscribed: the Stripe subscription is canceled, the Supabase user is gone, signing in again starts fresh.
- [ ] `npm run test:e2e` passes locally and in CI.

## 2. Stripe live

- [ ] Stripe account activated: business details, bank account, statement descriptor `LOCIROS`.
- [ ] Stripe Tax on with your registrations, or `STRIPE_AUTOMATIC_TAX=false` and tax-inclusive prices.
- [ ] Customer portal configured (deploy §5 step 3) in **live** mode; it is separate from test mode.
- [ ] Live product and prices created; the amounts match `NEXT_PUBLIC_PRICE_MONTHLY` and `NEXT_PUBLIC_PRICE_ANNUAL` on Vercel.
- [ ] Live webhook endpoint `https://lociros.com/api/billing/webhook`, live signing secret in `STRIPE_WEBHOOK_SECRET`.
- [ ] Live `STRIPE_SECRET_KEY` (or a restricted key) on the box only. Never in Vercel.
- [ ] Smart Retries and the failed-payment emails on.
- [ ] One real purchase on your own card, then refund it from the dashboard.

## 3. API box

- [ ] `api.lociros.com` A record → static IP; `sudo sh infra/caddy-setup.sh api.lociros.com` ([deploy §2e](deploy.md#2e-https-with-caddy)).
- [ ] Lightsail firewall: 22, 80, 443 only. `curl http://PUBLIC_IP:8000/health` from your laptop must fail.
- [ ] `/opt/lociros/.env` has every production variable in [deploy §4](deploy.md#4-backend-environment-production). The startup log has no "billing is not configured" or "SUPABASE_SERVICE_ROLE_KEY is not set" lines.
- [ ] `APP_ENV=production` (turns on the paywall, `REQUIRE_AUTH`, secure cookies, and turns off legacy tokens and `/docs`).
- [ ] Migrations applied: `scripts/deploy-api.sh` runs `alembic upgrade head` before the restart. `alembic current` reports `0008_billing`.
- [ ] Lightsail automatic snapshots on.

## 4. Vercel

- [ ] Frontend: `NLP_BACKEND_URL=https://api.lociros.com`, `NEXT_PUBLIC_SITE_URL`, Supabase URL and publishable key, price and trial env, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_SENTRY_DSN` ([deploy §3](deploy.md#3-frontend-on-vercel)).
- [ ] Admin: same backend URL, `ADMIN_EMAIL`, `ADMIN_PRICE_*`, Sentry DSN.
- [ ] `lociros.com` and `www` on the frontend project; `admin.lociros.com` on the admin project.
- [ ] Response headers on `https://lociros.com/` include `content-security-policy` and `strict-transport-security`. Sign-in, a passage, audio, and checkout all work with the CSP on (browser console clean).
- [ ] `https://lociros.com/robots.txt`, `/sitemap.xml`, and `/opengraph-image` load. Paste the URL into a link preview (Slack, iMessage) and check the card.

## 5. Supabase

- [ ] Auth → URL configuration: Site URL `https://lociros.com`; Redirect URLs include `https://lociros.com/auth/callback`.
- [ ] Auth → SMTP: a real sender (Resend, Postmark, or SES) so confirmation and reset emails do not hit the built-in rate limit.
- [ ] Email templates mention Lociros and link to `lociros.com`.
- [ ] Database advisors clean (RLS on every public table, including `stripe_events` and `llm_usage`).
- [ ] Plan with daily backups; PITR if affordable. One restore drill done ([deploy §6](deploy.md#backups)).

## 6. Content

- [ ] Each public language has enough passages per band for a paying reader's first weeks. At the October 2026 count Japanese has about 180; Russian, Italian, and Arabic have 8 to 16 with little B2. Either run `PYTHONPATH=backend python scripts/batch_catalog.py --language it --levels A1,A2,B1,B2 --count 10` (and `ru`, `ar`) against production, or set `SHOW_ITALIAN`, `SHOW_ARABIC`, `SHOW_RUSSIAN` to `false` until they are grown. The landing page follows the flags.
- [ ] Spot-read five new passages per language for quality before showing them.

## 7. Legal and support

- [ ] `hello@lociros.com` (or `CONTACT_EMAIL`) receives mail and someone reads it.
- [ ] `/terms` and `/privacy` reviewed for your jurisdiction (business entity name, governing law). `LEGAL_UPDATED` in `frontend/src/lib/contact.ts` set to the publish date.
- [ ] The processors list in `/privacy` matches what is actually configured (Sentry only if a DSN is set).

## 8. Monitoring

- [ ] Uptime checks on `/`, `/api/health/ready`, and `https://api.lociros.com/health` ([deploy §6](deploy.md#uptime)).
- [ ] Sentry projects receiving events: throw a test error on each and confirm the alert.
- [ ] OpenRouter monthly budget and alert set.
- [ ] Admin dashboard shows the Revenue panel and Model usage.

## 9. Launch day

- [ ] Deploy API (`scripts/deploy-api.sh`), then the frontend and admin.
- [ ] Buy a monthly plan on a real card, read a passage, cancel in the portal, refund.
- [ ] Watch Sentry, the Stripe webhook delivery log, and the admin dashboard for the first hours.
