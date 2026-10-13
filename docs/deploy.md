# Production deploy

Lociros is three pieces in production.

| Piece | Where | Why |
| ----- | ----- | --- |
| Next.js frontend and admin | [Vercel](https://vercel.com) (two projects) | App Router, `/api` proxy, passage SSR; `admin.lociros.com` |
| Postgres + Auth | [Supabase](https://supabase.com) | Catalog, learner state, generation jobs, sign-in |
| FastAPI + worker threads | AWS Lightsail 4 GB instance | Sudachi / spaCy / CAMeL / pymorphy3 do not fit a Vercel function |

Audio MP3s live on the Lightsail host in `/opt/lociros/audio`, mounted into the containers by `scripts/lightsail-run.sh`, so they survive a redeploy.

```
Browser
   │
   ▼
Vercel  (Next.js)
   ├─ /api/*   →  proxy to https://api.lociros.com  (+ PROXY_SECRET, visitor IP)
   └─ SSR      →  NLP_BACKEND_URL
                    │
                    ▼
Lightsail instance
   nginx :443  (TLS, flood guard, least-conn load balancing)
     ├─ lociros-api-1  127.0.0.1:8001   requests + generation threads + news scheduler + seeding
     └─ lociros-api-2  127.0.0.1:8002   requests + generation threads
   lociros-redis      (shared rate-limit windows and cooldowns)
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

Startup never runs `alembic upgrade`. It creates missing tables and a fixed list of late columns, and stamps Alembic only on a database that has no `alembic_version` yet. Migrations run in exactly one place: `scripts/deploy-api.sh` runs `alembic upgrade head` from the new image before any replica restarts (section 2d). Old replicas keep serving while it runs, so a migration must work with the previous release too: add columns and indexes first, drop them a release later. Take a Supabase backup (Database → Backups) before a migration that rewrites data.

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
5. Networking → IPv4 firewall: **SSH 22**, **HTTP 80**, **HTTPS 443**. Do not open 8000–8009; nginx proxies to the replicas on localhost (step 2e). Attach a **static IP** so DNS survives a reboot.
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
PROXY_SECRET=paste-another-long-random-string
ADMIN_EMAILS=you@example.com
REQUIRE_AUTH=true
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...
SUPABASE_SERVICE_ROLE_KEY=...
SENTRY_DSN=https://...ingest.sentry.io/...
```

Generate `JWT_SECRET` and `PROXY_SECRET` with `openssl rand -hex 32` (two different values). `PROXY_SECRET` goes on the Vercel frontend project too (section 3): every request reaches the API from Vercel's shared addresses, and the secret is how the API and nginx know they can trust the visitor address Vercel passes along. Without it, rate limits treat all guests as one caller. Percent-encode reserved characters in the database password. Keep `PUBLIC_BASE_URL` as localhost until the Vercel frontend exists.

`REQUIRE_AUTH` defaults to `true` when `APP_ENV=production`. It limits custom-passage generation to signed-in accounts. Without it, any browser can generate up to `GENERATE_MONTHLY_CAP` (default 10) passages a month per device id; device ids are client-chosen, so the per-IP rate limit is then the real ceiling. `ADMIN_EMAILS` empty means nobody can open admin routes.

With `APP_ENV=production` the API also turns off `/docs` and `/openapi.json`, returns 404 for the legacy magic-link and Google cookie routes, and stops accepting the old HS256 tokens (`ALLOW_LEGACY_TOKENS`). Supabase Auth is the only sign-in. The paywall is requested by default in production (`PAYWALL_ENABLED`), but it is enforced only once `STRIPE_SECRET_KEY` and `STRIPE_PRICE_MONTHLY` are set, so an expired trial is never stuck in front of a checkout that cannot open. See section 5 for Stripe.

### 2d. Build the image on this Mac, load it on Lightsail

From the **repo root** (the image is about 3 GB; the first build takes a while):

```bash
docker build --platform linux/amd64 -f backend/Dockerfile -t lociros-backend .
docker save lociros-backend | gzip | ssh ubuntu@PUBLIC_IP 'gzip -d | docker load'
scp scripts/lightsail-run.sh ubuntu@PUBLIC_IP:
ssh ubuntu@PUBLIC_IP 'sh lightsail-run.sh'
```

`lightsail-run.sh` starts a Redis container and `API_REPLICAS` (default 2) API containers on `127.0.0.1:8001`, `127.0.0.1:8002`, … on a private Docker network. It creates `/opt/lociros/audio` (owned by uid 1000, the image's user) and mounts it as `AUDIO_DIR`. Every replica runs `GENERATE_WORKERS` generation threads (default 4), so custom passages keep flowing while one replica restarts; a replica that stops hands its unfinished jobs back to the queue. Replica 1 also seeds the library on first start (several minutes) and runs the daily news scheduler; the others set `NEWS_SCHEDULER=false` and `SKIP_SEED=true`. Check from the box:

```bash
curl -fsS http://127.0.0.1:8001/api/health/ready
curl -fsS http://127.0.0.1:8002/api/health/ready
# both include "db": true
```

Later deploys from the Mac (Docker Desktop must be running): `SSH_KEY=~/.ssh/lightsail-us-east-1.pem API_HOST=ubuntu@PUBLIC_IP sh scripts/deploy-api.sh` builds, ships, runs migrations, and restarts the replicas one at a time. Before each replica is replaced, nginx is told to stop sending it new requests; uvicorn finishes in-flight requests for up to 30 s (Docker allows 40 s before it kills the container), the new container must pass `/api/health/ready`, and only then is the next replica touched. Custom passages are queued jobs, so a restart never cuts one off mid-generation; the stopping replica hands unfinished jobs back to the queue. If a new replica fails its health check the script stops, leaving the others on the old image, and puts the failed replica back in nginx's rotation (nginx skips it while it is down). The script ends by checking `https://api.lociros.com/api/health/ready`.

Each deploy tags the image with its git hash as well as `latest`, and the box keeps the last three. To go back: `SSH_KEY=… API_HOST=… sh scripts/rollback-api.sh` (the previous image) or add `TO=<hash>`. Rollback does not undo migrations. Each replica is capped at 1.8 GB of RAM (`API_MEMORY`) plus some swap.

### 2e. HTTPS and load balancing with nginx

1. Create an `A` record `api.lociros.com` → the instance's static IP.
2. Make sure `PROXY_SECRET` is in `/opt/lociros/.env` (step 2c).
3. Copy `infra/` to the box and run the setup script:

```bash
scp -r infra ubuntu@PUBLIC_IP:
ssh ubuntu@PUBLIC_IP 'sudo sh infra/nginx-setup.sh api.lociros.com you@example.com'
curl -fsS https://api.lociros.com/health
```

The script adds 2 GB of swap, installs nginx and certbot, gets the certificate (renewed by certbot's timer), and installs `infra/nginx/lociros.conf`. If Caddy from an earlier setup is running, it is stopped and disabled. Re-run it whenever `PROXY_SECRET` changes. nginx:

- balances requests across the replicas with `least_conn` and keeps connections to them open;
- retries a request on another replica when one is down or restarting (writes are only retried if they never reached the replica);
- caps bodies at 1 MB, and allows 120 s for slow translation calls (no gzip: Vercel compresses for browsers);
- limits each visitor to 30 requests per second (burst 60) and 40 open connections. The visitor is the address Vercel vouches for with `PROXY_SECRET`, so limits apply per person, not per Vercel address. Stripe webhooks are exempt.

Uvicorn only trusts `X-Forwarded-*` from the host and Docker bridges (`FORWARDED_ALLOW_IPS`, default `127.0.0.1,172.16.0.0/12`). The per-route limits in the API (for example 6 custom passages a minute) are kept in Redis, so they hold across replicas.

4. Set `NLP_BACKEND_URL=https://api.lociros.com` on both Vercel projects and `PROXY_SECRET` on the frontend project, then redeploy them.
5. In the Lightsail firewall, make sure only 22, 80, and 443 are open.

### 2f. Capacity

The $24 plan's CPU is burstable: 2 vCPUs, but only 20% of each is sustained all day. Above that it spends burst capacity, which refills while traffic is low (a full bank is roughly six hours of both cores flat out). So the box has two numbers: what it sustains, and what it can absorb at peak.

Measured October 2026 with `infra/loadtest/compose.yml` plus `infra/loadtest/lightsail.yml` (same nginx config, two replicas capped at Lightsail's CPU, 1.8 GB each, Postgres capped at one core), using `scripts/loadtest.py --scenario session`: each simulated reader loads the shelf, opens a passage, taps 12 words, and rates it, the way the app does. The test machine's cores are faster than Lightsail's, so the figures below are already discounted by a third.

| | Requests a second | Passages read a minute | Readers at once (one passage per 4 min, 18 requests) |
| --- | --- | --- | --- |
| Sustained (baseline CPU) | about 50 | about 175 | about 650 |
| Burst (both cores) | about 300 | about 1,100 | about 4,000 |

p95 latency stayed under 0.5 s at both levels, with no errors. Killing a replica mid-test produced no failed requests.

In daily users: with 20 minutes of reading per person a day and the busiest hour carrying about 12% of the day, 10,000 daily readers average about 140 at once and peak around 400. The averaged load must stay under the sustained figure and the peak under the burst figure, which puts the ceiling at roughly 30,000–40,000 daily readers; treat 15,000–20,000 as comfortable. Check the Lightsail **CPU burst capacity** graph weekly: a bank that trends toward zero means sustained load is above the baseline.

Custom passages are a separate limit, set by how long OpenRouter takes and how many generation threads wait on it. Each passage is a draft (with its translation), a gloss call, and in about half of cases a corrective edit plus a second gloss call. The figures below were measured before the October 2026 prompt tuning; with the tuned prompt Gemini 3.1 Flash Lite averaged 4.2 s per passage. Measured October 2026 with `scripts/bench_generation.py` (16 passages per model across all four languages, eight at once):

| `LLM_MODEL` | Per passage (mean / worst) | Draft speed | Passed level | Output cost per 1,000 passages |
| --- | --- | --- | --- | --- |
| `google/gemini-3.1-flash-lite` (default) | 6.6 s / 9.5 s | about 240 tokens/s | 7 of 16 | about $2.40 |
| `google/gemini-3.5-flash-lite` | 8.4 s / 12 s | about 210 tokens/s | 4 of 16 | about $4.80 |
| `openai/gpt-5.4-nano` | 16 s / 28 s | about 145 tokens/s | 5 of 16 | about $2.60 |
| `openai/gpt-4o-mini` (previous default) | 20 s / 42 s | about 100 tokens/s | 6 of 16 | about $1.00 |

Two replicas × 4 threads is 8 passages in flight, which at about 7 s each is roughly 60–70 passages a minute (about 4,000 an hour). With the monthly cap of 10 per account that is far above what 20,000 daily readers ask for. Above that the queue grows and the CPU becomes the next limit: each passage spends well under a second in the analyzers, but those run in the same process as requests. If the queue backs up while CPU has headroom, raise `GENERATE_WORKERS` to 6–8.

What keeps generation fast:

- **Provider routing.** Every call asks OpenRouter for its highest-throughput provider (`LLM_PROVIDER_SORT=throughput`), which alone cut `gpt-4o-mini` drafts from 9.2 s to 6.9 s.
- **Fallback models.** If the main model errors or is overloaded, OpenRouter retries the same request on `LLM_FALLBACK_MODELS` instead of failing the job.
- **A hard time limit per call.** OpenRouter keeps a busy request open with keep-alive bytes, so the client's own timeout never fires. Each call streams and is cut off at its deadline (60 s for a draft, 30–45 s otherwise), so a stuck provider cannot hold a thread.
- **No database connection while waiting.** The worker releases its pooled connection during LLM calls, so thread count is not tied to `DB_POOL_SIZE`.
- **Credits.** Turn on auto top-up in OpenRouter. When the balance hits zero every generation fails at once.

Avoid thinking models (Qwen 3.8 Flash timed out on every draft) unless you also set `LLM_REASONING_EFFORT=low` and re-run the benchmark. To compare models before switching:

```bash
cd backend && .venv/bin/python ../scripts/bench_generation.py --models google/gemini-3.1-flash-lite,openai/gpt-4o-mini --per 2
```

It uses a throwaway SQLite file, never the database in `.env`, and costs well under a dollar.

Run the same test against production after launch for the real figure:

```bash
backend/.venv/bin/python scripts/loadtest.py --scenario session --url https://api.lociros.com --users 20 --duration 60 --think 0 --proxy-secret "$PROXY_SECRET"
```

Memory is the other limit. Each replica preloads the public languages' analyzers at startup (`PRELOAD_ANALYZERS`, on in production) and stays at about 1.5 GB with all four; CAMeL for Arabic is 1 GB of that. Two replicas use about 3 GB of the 4 GB, with the swap file as a cushion. Do not raise `API_REPLICAS` on the 4 GB plan. Setting `SHOW_ARABIC=false` frees about 1 GB per replica. Watch `docker stats` and the CPU graph in Lightsail. If both replicas sit near 100% CPU for long stretches, the box is outgrown: the next Lightsail plan with more cores (16 GB, 4 vCPUs) takes `API_REPLICAS=4` with no other change.

Each replica keeps up to `DB_POOL_SIZE + DB_MAX_OVERFLOW` Postgres connections. Supabase's session pooler allows 15 on this project's compute, so `lightsail-run.sh` sets 4 + 3 per replica (14 in total) unless the env file says otherwise. If you add replicas or raise those numbers, raise **Pool Size** under Database → Settings → Connection pooling first (the database allows 60).

---

## 3. Frontend on Vercel

1. Import the GitHub repo in [Vercel](https://vercel.com/new).
2. Set **Root Directory** to `frontend`.
3. Do **not** set `NEXT_PUBLIC_DEMO`.
4. Add `NLP_BACKEND_URL` = the public FastAPI origin from step 2 (`https://api.lociros.com`) and `PROXY_SECRET` = the same value as on the box.
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
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | `lightsail-run.sh` sets `4` / `3` per replica unless set here; keep replicas × (both) under the Supabase pooler's pool size (section 2f) |
| `PRELOAD_ANALYZERS` | Defaults to `true` in production: load each public language's analyzer before the replica reports healthy |
| `PROXY_SECRET` | Long random string, same value on the Vercel projects. Lets the API and nginx rate limit per visitor |
| `REDIS_URL` | Set by `lightsail-run.sh` to the `lociros-redis` container. Shared rate-limit windows and translation cooldown; without it each process keeps its own |
| `PUBLIC_BASE_URL` | Frontend origin |
| `CORS_ORIGINS` | Same frontend origin |
| `CORS_ORIGIN_REGEX` | Optional, `https://.*\.vercel\.app` for preview URLs |
| `OPENROUTER_API_KEY` | Generation, LLM gloss, translation |
| `LLM_MODEL` / `LLM_FALLBACK_MODELS` | Default `google/gemini-3.1-flash-lite`, falling back to `openai/gpt-4o-mini`. See 2f before changing |
| `LLM_PROVIDER_SORT` | `throughput` (default): OpenRouter picks the fastest provider for the model |
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
| `NEWS_SCHEDULER` | `false` (default). `true` builds daily news hourly in the background. `lightsail-run.sh` turns it on for replica 1 only |
| `MAX_BODY_BYTES` | Request body cap, default `262144` |
| `GENERATE_MONTHLY_CAP` | Custom passages per account or device per month (default `10`) |
| `GENERATE_WORKERS` | Generation threads per replica, default `4` on every replica (set by `lightsail-run.sh`) |
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | Only needed where `scripts/batch_catalog.py` makes audio |
| `SUPABASE_URL` | `https://PROJECT.supabase.co` — inferred from a direct `db.*.supabase.co` URI |
| `SKIP_SEED` | `true` on every replica but the first (set by `lightsail-run.sh`) |

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
| Restock gives up with "taking too long" | Both replicas are down or busy, or the LLM is hanging. Every replica runs generation threads, and pending jobs wait in the queue; nothing is lost. The client stops polling after three minutes; the API marks a job stuck in `running` for 10 minutes as failed |
| Restock returns 429 | Monthly cap, pending-job limit, or the per-minute rate limit |
| Many unrelated users get 429 at once | `PROXY_SECRET` missing or different on Vercel and the box (or nginx not re-run after changing it), so everyone counts as Vercel's few addresses |
| 502 from nginx | Every replica is down: `docker ps`, `docker logs lociros-api-1`. `/var/log/nginx/lociros.error.log` shows which upstream failed |
| A replica restarts on its own | Out of memory: `docker inspect -f '{{.State.OOMKilled}}' lociros-api-2`, `free -m`. Check the swap file exists |
| `max clients reached` / `too many connections` | Replicas × `DB_POOL_SIZE + DB_MAX_OVERFLOW` exceeds the Supabase pooler's pool size (section 2f) |
| Admin dashboard says "Not configured" | `ADMIN_EMAIL` or the Supabase variables are missing on the admin project |
| A new column or index is missing in production | The deploy stopped before migrations ran. Re-run `scripts/deploy-api.sh`; it migrates before restarting |
| Checkout returns 503 "Billing is not set up" | `STRIPE_SECRET_KEY` or `STRIPE_PRICE_MONTHLY` missing on the API |
| Paid but still paywalled | Webhook not reaching the API: check the endpoint URL, `STRIPE_WEBHOOK_SECRET`, and Stripe's delivery log |
| Webhook returns 400 | Wrong signing secret, or something re-encoded the body before FastAPI |
| Google redirect mismatch | Callback must be `https://FRONTEND/auth/callback` in Supabase Auth → Redirect URLs |
