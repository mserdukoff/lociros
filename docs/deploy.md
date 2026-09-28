# Production deploy

Lociros is three pieces in production.

| Piece | Where | Why |
| ----- | ----- | --- |
| Next.js frontend | [Vercel](https://vercel.com) | App Router, `/api` proxy, passage SSR |
| Postgres | [Supabase](https://supabase.com) | Catalog, learner state, generation jobs |
| FastAPI + worker | AWS Lightsail 4 GB instance (or any Docker host) | Sudachi / spaCy / CAMeL / pymorphy3 do not fit a Vercel function |

Audio MP3s stay on the API container disk. One API instance is enough.

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

---

## 2. FastAPI on AWS Lightsail

Do **not** use ECS, an ALB, RDS, or S3. Postgres stays on Supabase. A **$24/month 4 GB Lightsail instance** is enough RAM for Sudachi / spaCy / CAMeL and includes a public IPv4. Lightsail container services need the $80 “Large” (4 GB) plan for the same RAM, so skip those.

This Mac’s saved AWS keys were invalid, so create the instance in the **new account’s console**.

### 2a. AWS credentials

In the new account: IAM → your user → **Access keys**. Then on this Mac:

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
5. Networking → IPv4 firewall: **SSH 22**, **Custom TCP 8000** (and **80/443** later if you add Caddy).
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
```

Generate `JWT_SECRET` with `openssl rand -hex 32`. Percent-encode reserved characters in the database password. Keep `PUBLIC_BASE_URL` as localhost until the Vercel frontend exists.

### 2d. Build the image on this Mac, load it on Lightsail

From the **repo root** (the image is large; first build takes a while):

```bash
docker build -f backend/Dockerfile -t lociros-backend .
docker save lociros-backend | gzip | ssh ubuntu@PUBLIC_IP 'gzip -d | docker load'
scp scripts/lightsail-run.sh ubuntu@PUBLIC_IP:
ssh ubuntu@PUBLIC_IP 'chmod +x lightsail-run.sh && ./lightsail-run.sh'
```

First start seeds the library and can take several minutes. Then:

```bash
curl -fsS "http://PUBLIC_IP:8000/health"
curl -fsS "http://PUBLIC_IP:8000/api/health/ready"
# ready includes "db": true
```

That `http://PUBLIC_IP:8000` origin is `NLP_BACKEND_URL` when you later create the Vercel project. Server-side fetch does not need HTTPS. Add a domain and Caddy on 80/443 when you have one.

One API process with `WEB_CONCURRENCY=1` and `GENERATE_WORKERS=2` is enough. Do not run a second worker container on this box.

### 2e. Optional: HTTPS later

When you have a hostname pointing at the instance, put Caddy in front of `:8000` and open 80/443. Until then, leave the API on `:8000`.

---

## 3. Frontend on Vercel

1. Import the GitHub repo in [Vercel](https://vercel.com/new).
2. Set **Root Directory** to `frontend`.
3. Do **not** set `NEXT_PUBLIC_DEMO`.
4. Add `NLP_BACKEND_URL` = the public FastAPI origin from step 2.
5. Add `NEXT_PUBLIC_SUPABASE_URL` = `https://gsvkckwuiqajwfkynjrm.supabase.co`
6. Add `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from Dashboard → **API Keys** (publishable, not secret).

`NLP_BACKEND_URL` is server-only. After deploy:

```bash
curl -fsS "https://YOUR_VERCEL_DOMAIN/health"
curl -fsS "https://YOUR_VERCEL_DOMAIN/api/health/ready"
```

Open `/library`. The shelf should load from FastAPI, not the static demo banner.

Set backend `PUBLIC_BASE_URL` and `CORS_ORIGINS` to the **frontend** origin (the URL users type). Set `ADMIN_EMAILS` to the address that should open the admin dashboard.

---

## 3b. Admin dashboard on Vercel (`admin.lociros.com`)

The dashboard is its own Next app in `admin/`. It shows a sign-in form, and only unlocks for `ADMIN_EMAIL`. The main site's `/admin` redirects there.

1. In Vercel, add a **second** project from the same repo.
2. Set **Root Directory** to `admin`.
3. Add environment variables:
   - `ADMIN_EMAIL` = `m.serdukoff@gmail.com`
   - `NLP_BACKEND_URL` = the same FastAPI origin as the frontend
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the same values as the frontend
   - `ADMIN_TIME_ZONE` (optional, default `America/New_York`)
4. Under **Domains**, add `admin.lociros.com`, then create the DNS record Vercel shows (a `CNAME` to `cname.vercel-dns.com`).
5. On the backend, `ADMIN_EMAILS` must include the same address. The API checks it again on `/api/admin/overview`.
6. On the frontend project, set `NEXT_PUBLIC_ADMIN_URL` only if the dashboard lives somewhere other than `https://admin.lociros.com`.

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
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | `5` / `5` is a safe start |
| `PUBLIC_BASE_URL` | Frontend origin |
| `CORS_ORIGINS` | Same frontend origin |
| `CORS_ORIGIN_REGEX` | Optional, `https://.*\.vercel\.app` for preview URLs |
| `OPENROUTER_API_KEY` | Generation, LLM gloss, translation |
| `ADMIN_EMAILS` | Comma-separated emails the admin API accepts (include the admin app's `ADMIN_EMAIL`) |
| `SUPABASE_URL` | `https://PROJECT.supabase.co` — inferred from a direct `db.*.supabase.co` URI |
| `SKIP_SEED` | `true` on extra API/worker processes after the first seed |

Do not set `COOKIE_DOMAIN`. The Vercel proxy sets cookies on the frontend host.

---

## 5. Local development

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
| Generate 202 forever | No worker threads (`GENERATE_WORKERS=0`) and no worker process |
| Google redirect mismatch | Callback must be `https://FRONTEND/auth/callback` in Supabase Auth → Redirect URLs |
