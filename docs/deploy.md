# Production deploy

Lociros is three pieces in production.

| Piece | Where | Why |
| ----- | ----- | --- |
| Next.js frontend and admin | [Vercel](https://vercel.com) (two projects) | App Router, `/api` proxy, passage SSR; `admin.lociros.com` |
| Postgres + Auth | [Supabase](https://supabase.com) | Catalog, learner state, generation jobs, sign-in |
| FastAPI + worker threads | AWS Lightsail 4 GB instance | Sudachi / spaCy / CAMeL / pymorphy3 do not fit a Vercel function |

Audio MP3s live on the Lightsail host in `/opt/lociros/audio`, mounted into the container by `scripts/lightsail-run.sh`, so they survive a redeploy. One API instance is enough.

```
Browser
   │
   ▼
Vercel  (Next.js)
   ├─ /api/*   →  proxy to the public FastAPI origin
   └─ SSR      →  NLP_BACKEND_URL
                    │
                    ▼
FastAPI :8000  (Lightsail instance)
                    │
                    └─ Supabase  (session pooler :5432)
```

The browser only talks to the Vercel origin. Cookies stay first-party (`SameSite=Lax`).

---

## 1. Supabase Postgres

The **Lociros** project (`gsvkckwuiqajwfkynjrm`, `us-west-2`) already has the tables, RLS, and Auth sync: `auth.users` inserts/updates `public.users` (`auth_id` FK, `ON DELETE CASCADE`).

Identity is **Supabase Auth**. FastAPI never reads the Data API. It verifies the user's access token against the project's JWKS (`/auth/v1/.well-known/jwks.json`) and maps `sub` → `public.users.auth_id`.

In the dashboard:

1. **Authentication → URL configuration** (local for now)
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/auth/callback` and `http://127.0.0.1:3000/auth/callback`
   - Add the Vercel origin later, when that project exists.
2. Email + password is the sign-in method. In **Authentication → Providers → Email**, turn **Confirm email** off so signup does not depend on outbound mail.
3. Google (later): **Authentication → Providers → Google**. Use the same Google client as before. Authorized redirect URI on Google is `https://gsvkckwuiqajwfkynjrm.supabase.co/auth/v1/callback`.

Dashboard → **Connect**:

1. Prefer **Session pooler** (port **5432**) on IPv4-only hosts. A laptop with IPv6 can use the direct `db.…supabase.co:5432` URI.
2. Username is `postgres` on the direct host, `postgres.gsvkckwuiqajwfkynjrm` on the pooler.
3. Percent-encode reserved characters in the password (`&`, `#`, `?`, `!`, space). Do not wrap the password in `[brackets]`.

```
# pooler (IPv4)
postgresql://postgres.gsvkckwuiqajwfkynjrm:PASSWORD@HOST:5432/postgres

# direct (IPv6)
postgresql://postgres:PASSWORD@db.gsvkckwuiqajwfkynjrm.supabase.co:5432/postgres
```

The app rewrites `postgres://` / `postgresql://` to `postgresql+psycopg2://` and sets `sslmode=require` for Supabase hosts.

Do **not** use the **transaction** pooler (port **6543**).

Optional: turn off the **Data API**. FastAPI is the only client.

First FastAPI start against this database no-ops `create_all`, stamps Alembic, and seeds the library. That can take several minutes. Confirm with `select count(*) from passages;`

Startup never runs `alembic upgrade`. It creates missing tables and a fixed list of late columns, and stamps Alembic only on a database that has no `alembic_version` yet. When a release adds a migration that changes anything else (an index, a constraint, a data fix), apply it by hand before or after deploying, with `DATABASE_URL` pointing at Supabase:

```bash
cd backend && alembic upgrade head
```

---

## 2. FastAPI on AWS Lightsail

Do **not** use ECS, an ALB, RDS, or S3. Postgres stays on Supabase. A **$24/month 4 GB Lightsail instance** is enough RAM for Sudachi / spaCy / CAMeL and includes a public IPv4. Lightsail container services need the $80 “Large” (4 GB) plan for the same RAM, so skip those.

### 2a. AWS credentials

In the AWS account: IAM → your user → **Access keys**. Then on your machine:

```bash
aws configure
# AWS Access Key ID / Secret
# Default region: us-west-2   (same as the Supabase project)
# Output: json
aws sts get-caller-identity
```

You can also do everything below in the [Lightsail console](https://lightsail.aws.amazon.com/ls/webapp/home/instances) without the CLI.

### 2b. Create the instance

1. Region **us-west-2 (Oregon)**.
2. Platform **Linux/Unix**, blueprint **OS only → Ubuntu 24.04**.
3. Plan **$24, 4 GB RAM, 2 vCPUs** (IPv4).
4. Name `lociros-api`. Create.
5. Networking → IPv4 firewall: **SSH 22**, **HTTP 80**, **HTTPS 443**. Do not open 8000; Caddy proxies to it on localhost (step 2e). Attach a **static IP** so DNS survives a reboot.
6. Copy the public IPv4.

Lightsail is IPv4-only. In Supabase → **Connect**, copy the **Session pooler** URI (port **5432**, user `postgres.gsvkckwuiqajwfkynjrm`). Do not use the direct `db.*.supabase.co` host.

### 2c. Production env on the box

SSH in (browser terminal in Lightsail, or `ssh -i ~/.ssh/lightsail.pem ubuntu@PUBLIC_IP`). Then:

```bash
sudo apt-get update
sudo apt-get install -y docker.io curl
sudo usermod -aG docker ubuntu
# log out and back in so docker works without sudo
sudo mkdir -p /opt/lociros
sudo nano /opt/lociros/.env
```

Minimum `/opt/lociros/.env`:

```
APP_ENV=production
JWT_SECRET=paste-a-long-random-string
DATABASE_URL=postgresql://postgres.gsvkckwuiqajwfkynjrm:PASSWORD@aws-0-us-west-2.pooler.supabase.com:5432/postgres
DB_SSLMODE=require
SUPABASE_URL=https://gsvkckwuiqajwfkynjrm.supabase.co
OPENROUTER_API_KEY=sk-or-...
PUBLIC_BASE_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
GENERATE_WORKERS=2
ADMIN_EMAILS=you@example.com
REQUIRE_AUTH=true
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...
SUPABASE_SERVICE_ROLE_KEY=...
SENTRY_DSN=https://...ingest.sentry.io/...
```

Generate `JWT_SECRET` with `openssl rand -hex 32`. Percent-encode reserved characters in the database password. Keep `PUBLIC_BASE_URL` as localhost until the Vercel frontend exists.

`REQUIRE_AUTH` defaults to `true` when `APP_ENV=production`. It limits custom-passage generation to signed-in accounts. Without it, any browser can generate up to `GENERATE_MONTHLY_CAP` (default 10) passages a month per device id; device ids are client-chosen, so the per-IP rate limit is then the real ceiling. `ADMIN_EMAILS` empty means nobody can open admin routes.

With `APP_ENV=production` the API also turns off `/docs` and `/openapi.json`, returns 404 for the legacy magic-link and Google cookie routes, and stops accepting the old HS256 tokens (`ALLOW_LEGACY_TOKENS`). Supabase Auth is the only sign-in. The paywall is on (`PAYWALL_ENABLED` defaults to true in production); see section 5 for Stripe.

### 2d. Build the image on this Mac, load it on Lightsail

From the **repo root** (the image is large; first build takes a while):

```bash
docker build -f backend/Dockerfile -t lociros-backend .
docker save lociros-backend | gzip | ssh ubuntu@PUBLIC_IP 'gzip -d | docker load'
scp scripts/lightsail-run.sh ubuntu@PUBLIC_IP:
ssh ubuntu@PUBLIC_IP 'chmod +x lightsail-run.sh && ./lightsail-run.sh'
```

`lightsail-run.sh` creates `/opt/lociros/audio` (owned by uid 1000, the image's user) and mounts it as `AUDIO_DIR`. First start seeds the library and can take several minutes. Then:

```bash
curl -fsS "http://PUBLIC_IP:8000/health"
curl -fsS "http://PUBLIC_IP:8000/api/health/ready"
# ready includes "db": true
```

`lightsail-run.sh` publishes the container on `127.0.0.1:8000` only. Check it from the box with `curl -fsS http://127.0.0.1:8000/health`, then set up HTTPS (step 2e). To publish `:8000` publicly for a one-off test before DNS exists, run it with `PUBLISH=8000:8000` and open the port temporarily.

Later deploys from the Mac: `API_HOST=ubuntu@PUBLIC_IP sh scripts/deploy-api.sh` builds, ships, restarts, and health-checks in one go.

One API process with `WEB_CONCURRENCY=1` and `GENERATE_WORKERS=2` is enough. Do not run a second worker container on this box. Keep it at one process: rate limits and the translation cooldown live in process memory, and every extra uvicorn worker starts its own generation threads.

### 2e. HTTPS with Caddy

1. Create an `A` record `api.lociros.com` → the instance's static IP.
2. Copy `infra/` to the box and run the setup script:

```bash
scp -r infra ubuntu@PUBLIC_IP:
ssh ubuntu@PUBLIC_IP 'sudo sh infra/caddy-setup.sh api.lociros.com'
curl -fsS https://api.lociros.com/health
```

Caddy gets and renews the certificate, adds HSTS, and proxies to `127.0.0.1:8000`. Uvicorn only trusts `X-Forwarded-*` from the host and Docker bridges (`FORWARDED_ALLOW_IPS`, default `127.0.0.1,172.16.0.0/12`).

3. Set `NLP_BACKEND_URL=https://api.lociros.com` on both Vercel projects and redeploy them.
4. In the Lightsail firewall, make sure 8000 is closed.

---

## 3. Frontend on Vercel

1. Import the GitHub repo in [Vercel](https://vercel.com/new).
2. Set **Root Directory** to `frontend`.
3. Do **not** set `NEXT_PUBLIC_DEMO`.
4. Add `NLP_BACKEND_URL` = the public FastAPI origin from step 2.
5. Add `NEXT_PUBLIC_SUPABASE_URL` = `https://gsvkckwuiqajwfkynjrm.supabase.co`
6. Add `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from Dashboard → **API Keys** (publishable, not secret).
7. Add `NEXT_PUBLIC_SITE_URL` = `https://lociros.com` (canonical URLs, sitemap, Open Graph).
8. Pricing copy: `NEXT_PUBLIC_PRICE_MONTHLY` (default `$9.99`), `NEXT_PUBLIC_PRICE_ANNUAL` (default `$79.99`), optional `NEXT_PUBLIC_PRICE_ANNUAL_NOTE`, `NEXT_PUBLIC_TRIAL_DAYS` (default `7`). Keep these in step with the Stripe prices and backend `TRIAL_DAYS`.
9. `NEXT_PUBLIC_CONTACT_EMAIL` (default `hello@lociros.com`) and `NEXT_PUBLIC_SENTRY_DSN` (optional).

`NLP_BACKEND_URL` is server-only. After deploy:

```bash
curl -fsS "https://YOUR_VERCEL_DOMAIN/health"
curl -fsS "https://YOUR_VERCEL_DOMAIN/api/health/ready"
```

Open `/library`. The shelf should load from FastAPI, not the static demo banner.

Set backend `PUBLIC_BASE_URL` and `CORS_ORIGINS` to the **frontend** origin (the URL users type). Set `ADMIN_EMAILS` to the address that should open the admin dashboard.

---

## 3b. Admin dashboard on Vercel (`admin.lociros.com`)

The dashboard is its own Next app in `admin/`. It shows a sign-in form, and only unlocks for `ADMIN_EMAIL`. The main site has no admin page or link; `lociros.com/api/admin/*` is blocked by its proxy.

1. In Vercel, add a **second** project from the same repo.
2. Set **Root Directory** to `admin`.
3. Add environment variables:
   - `ADMIN_EMAIL` = the admin's address (required; if it is unset the dashboard shows "Not configured" and nobody gets in)
   - `NLP_BACKEND_URL` = the same FastAPI origin as the frontend
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the same values as the frontend
   - `ADMIN_TIME_ZONE` (optional, default `America/New_York`)
   - `ADMIN_PRICE_MONTHLY` / `ADMIN_PRICE_ANNUAL` (optional, defaults `9.99` / `79.99`), used for the monthly revenue estimate
   - `NEXT_PUBLIC_SENTRY_DSN` (optional)
4. Under **Domains**, add `admin.lociros.com`, then create the DNS record Vercel shows (a `CNAME` to `cname.vercel-dns.com`).
5. On the backend, `ADMIN_EMAILS` must include the same address. The API checks it again on `/api/admin/overview`.

The admin app calls FastAPI from the server only. The access token never reaches the browser, and there is no sign-up form. The admin account must already exist in Supabase Auth.

Local run: `cd admin && npm install && npm run dev` (port 3100), with the same env vars in `admin/.env.local`.

Google sign-in (later): enable the Google provider in Supabase Auth. On Google Cloud, the authorized redirect is `https://gsvkckwuiqajwfkynjrm.supabase.co/auth/v1/callback`. Add your Vercel origin to Redirect URLs only after that frontend exists.

---

## 4. Backend environment (production)

| Variable | Value |
| -------- | ----- |
| `APP_ENV` | `production` |
| `JWT_SECRET` | Long random string |
| `DATABASE_URL` | Supabase URI from step 1 |
| `DB_SSLMODE` | `require` (inferred for Supabase hosts) |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | Defaults `5` / `10`; `5` / `5` is a conservative override |
| `PUBLIC_BASE_URL` | Frontend origin |
| `CORS_ORIGINS` | Same frontend origin |
| `CORS_ORIGIN_REGEX` | Optional, `https://.*\.vercel\.app` for preview URLs |
| `OPENROUTER_API_KEY` | Generation, LLM gloss, translation |
| `ADMIN_EMAILS` | Comma-separated emails the admin API accepts (include the admin app's `ADMIN_EMAIL`). Empty locks admin routes |
| `REQUIRE_AUTH` | Defaults to `true` in production: only signed-in accounts can generate |
| `PAYWALL_ENABLED` | Defaults to `true` in production. `false` turns the paywall off everywhere |
| `TRIAL_DAYS` / `FREE_GUEST_PASSAGES` | Free week length (default `7`) and passages a guest can open before signing up (default `1`) |
| `STRIPE_SECRET_KEY` | `sk_live_...` (or a restricted key with Checkout, Customers, Subscriptions, Billing Portal) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from the webhook endpoint (section 5) |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` | Price ids for the two plans |
| `STRIPE_AUTOMATIC_TAX` | `true` (default) needs Stripe Tax enabled; set `false` otherwise |
| `SUPABASE_SERVICE_ROLE_KEY` | Lets account deletion remove the Supabase login. Server-only |
| `CONTACT_EMAIL` | Support address (default `hello@lociros.com`) |
| `SENTRY_DSN` / `SENTRY_TRACES_SAMPLE_RATE` | Error reporting; traces default `0` |
| `NEWS_SCHEDULER` | `true` (default): build daily news hourly in the background |
| `MAX_BODY_BYTES` | Request body cap, default `262144` |
| `GENERATE_MONTHLY_CAP` | Custom passages per account or device per month (default `10`) |
| `GENERATE_WORKERS` | `2` |
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | Only needed where `scripts/batch_catalog.py` makes audio |
| `SUPABASE_URL` | `https://PROJECT.supabase.co` — inferred from a direct `db.*.supabase.co` URI |
| `SKIP_SEED` | `true` on extra API/worker processes after the first seed |

Do not set `COOKIE_DOMAIN`. The Vercel proxy sets cookies on the frontend host.

---

## 5. Stripe

1. In the Stripe dashboard (live mode), create one product **Lociros** with two recurring prices: monthly and annual. Copy the price ids into `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_ANNUAL`.
2. **Settings → Tax**: turn on Stripe Tax and add your registrations, or set `STRIPE_AUTOMATIC_TAX=false`.
3. **Settings → Billing → Customer portal**: allow cancel (at period end), switching between the two prices, updating the payment method, and invoice history. Set the business name, support email, and links to `https://lociros.com/terms` and `/privacy`.
4. **Developers → Webhooks → Add endpoint**: `https://lociros.com/api/billing/webhook`. Events:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
5. **Settings → Billing → Subscriptions and emails**: turn on Smart Retries and the failed-payment and expiring-card emails.
6. Restart the API (`scripts/lightsail-run.sh` or `scripts/deploy-api.sh`).

The webhook goes through the Vercel `/api` proxy, which forwards the raw body and the `Stripe-Signature` header unchanged. Events are stored in `stripe_events`, so Stripe retries are applied once.

Test mode first: use `sk_test_` keys, test prices, and `stripe listen --forward-to localhost:8000/api/billing/webhook` locally. Card `4242 4242 4242 4242` succeeds, `4000 0000 0000 0341` fails after attaching.

---

## 6. Operations

### Uptime

Point an uptime monitor (Better Stack, UptimeRobot, or similar) at:

| Check | URL | Expect |
| ----- | --- | ------ |
| Site | `https://lociros.com/` | 200 |
| API through Vercel | `https://lociros.com/api/health/ready` | 200 with `"db": true` |
| API direct | `https://api.lociros.com/health` | 200 |

Alert by email and phone. A failing `ready` with a passing direct `health` usually means the database pooler, not the box.

### Errors

Create one Sentry organization with three projects: `lociros-api` (Python), `lociros-web` and `lociros-admin` (Next.js). Put each DSN in `SENTRY_DSN` (box) or `NEXT_PUBLIC_SENTRY_DSN` (Vercel). Nothing is sent when the DSN is empty. Add an alert for new issues and for any `billing` or `webhook` error.

### Backups

- **Database**: Supabase Pro takes daily backups (7 days). Turn on Point-in-Time Recovery if you can afford it once there are paying users. Also keep an off-platform copy weekly:

```bash
pg_dump "$DATABASE_URL" --no-owner --format=custom -f lociros-$(date +%F).dump
```

  Restore drill once before launch: create a scratch Supabase project, `pg_restore --no-owner -d "$SCRATCH_URL" lociros-YYYY-MM-DD.dump`, point a local API at it, and open the library.

- **Audio**: `/opt/lociros/audio` holds generated TTS. Turn on Lightsail automatic snapshots for the instance (daily, keeps 7). Losing audio only means regenerating it.
- **Stripe** is the source of truth for subscriptions. If the users table is restored from an old backup, replay the last days of events from **Developers → Events** or wait for the next renewal webhook.

### Costs

The admin dashboard shows the accounts with the most OpenRouter tokens this month (`llm_usage`). Set a monthly budget and alert in OpenRouter and in Stripe Radar for unusual refund rates.

---

## 7. Local development

SQLite or Compose Postgres, Next on `:3000`, FastAPI on `:8000`. See the [root README](../README.md).

To talk to hosted Supabase from a laptop, put the working URI in `backend/.env` and keep `APP_ENV=development` unless you also set a real `JWT_SECRET`.

---

## Static demo (optional)

```bash
cd frontend
NEXT_PUBLIC_DEMO=1 npm run dev
```

On Vercel, set `NEXT_PUBLIC_DEMO=1` at **build** time and omit `NLP_BACKEND_URL`. That is not the production app.

---

## Troubleshooting

| Symptom | Likely cause |
| ------- | ------------ |
| Shelf shows the static demo banner | `NEXT_PUBLIC_DEMO=1` is set on the Vercel project |
| `/api/*` returns 502 `Backend unavailable` | `NLP_BACKEND_URL` missing or FastAPI is down |
| `Tenant or user not found` | Pooler username must be `postgres.PROJECT_REF` |
| Connection timeout | Direct `db.*.supabase.co` on an IPv4-only host; use the session pooler |
| Restock gives up with "taking too long" | No worker threads (`GENERATE_WORKERS=0`) and no worker process, or the LLM is hanging. The client stops polling after three minutes; the API marks a job stuck in `running` for 10 minutes as failed |
| Restock returns 429 | Monthly cap, pending-job limit, or the per-minute rate limit |
| Admin dashboard says "Not configured" | `ADMIN_EMAIL` or the Supabase variables are missing on the admin project |
| A new column or index is missing in production | A migration was not applied; run `alembic upgrade head` |
| Checkout returns 503 "Billing is not set up" | `STRIPE_SECRET_KEY` or `STRIPE_PRICE_MONTHLY` missing on the API |
| Paid but still paywalled | Webhook not reaching the API: check the endpoint URL, `STRIPE_WEBHOOK_SECRET`, and Stripe's delivery log |
| Webhook returns 400 | Wrong signing secret, or something re-encoded the body before FastAPI |
| Google redirect mismatch | Callback must be `https://FRONTEND/auth/callback` in Supabase Auth → Redirect URLs |
