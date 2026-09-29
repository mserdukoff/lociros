# Lociros frontend

Next.js 16 (App Router, React 19) app for the Lociros shelf, reader, placement, and review. The product overview and the full docs are in the [root README](../README.md) and [`docs/`](../docs/README.md).

## Run

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase values
npm run dev                  # http://localhost:3000
```

FastAPI must be running at `NLP_BACKEND_URL` (default `http://127.0.0.1:8000`). For the static catalog with no backend, run `NEXT_PUBLIC_DEMO=1 npm run dev`.

`npm run lint` and `npm run build` run in CI.

## Routes

| Path | What it is |
| ---- | ---------- |
| `/` | Landing page with a live reader demo |
| `/library` | Shelf: placement, Continue, news, library, words, restock |
| `/passage/[id]` | Reader (server-fetched tokens) |
| `/placement` | Placement read |
| `/review` | SM-2 review of saved words |
| `/privacy`, `/terms` | Legal pages |
| `/auth/callback` | Supabase sign-in callback (only same-site `next` redirects) |
| `/admin` | Redirects to the admin app (`NEXT_PUBLIC_ADMIN_URL`) |
| `/api/*` | Proxy to FastAPI |

## The `/api` proxy

`src/app/api/[...path]/route.ts` forwards requests to `NLP_BACKEND_URL` at runtime. It drops any `Authorization` header from the browser and sets its own from the Supabase session cookie, forwards the other request headers (including `X-Device-Id` and `X-Forwarded-For`), and returns 404 for `admin/*`, `trial/*`, and the legacy `auth/google` and `auth/magic` paths. The admin dashboard is its own app in [`../admin`](../admin).

## Environment

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `NLP_BACKEND_URL` | `http://127.0.0.1:8000` | FastAPI origin for the proxy and SSR. Server-only, read at runtime |
| `NEXT_PUBLIC_SUPABASE_URL` | empty | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | empty | Publishable key (`NEXT_PUBLIC_SUPABASE_ANON_KEY` also works) |
| `NEXT_PUBLIC_ADMIN_URL` | `https://admin.lociros.com` | Where `/admin` redirects |
| `NEXT_PUBLIC_STICKY_START_TEST` | unset | `1` shows the sticky start bar test on the landing page |
| `NEXT_PUBLIC_DEMO` | unset | `1` at build time for the static catalog with no backend |
