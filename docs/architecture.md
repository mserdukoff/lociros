# Architecture

## Stack

| Layer | Choice |
| ----- | ------ |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Backend | FastAPI (sync), SQLAlchemy 2, Pydantic v2 |
| Database | SQLite locally; Postgres 16 in Compose; Supabase Postgres in production |
| Russian NLP | [razdel](https://github.com/natasha/razdel) tokenize + [pymorphy3](https://github.com/no-plagiarism/pymorphy3) lemma/tag |
| Italian NLP | [spaCy](https://spacy.io/) `it_core_news_md` |
| Arabic NLP | [CAMeL Tools](https://github.com/CAMeL-Lab/camel_tools) MSA morphology + MLE disambiguator |
| Japanese NLP | [Sudachi](https://github.com/WorksApplications/Sudachi) split mode C (`sudachipy` + `sudachidict_core`) |
| LLM | OpenRouter (`openai/gpt-4o-mini` by default) via the OpenAI Python SDK |
| Runtime | Python 3.12+, Node 20+ (frontend Docker image uses Node 22) |
| Packaging | `docker-compose.yml`: frontend `:3000`, backend `:8000`, Postgres, volume `levla-audio` |
| Auth | Supabase Auth (email and password) in the browser; FastAPI verifies the access token |
| Admin | Separate Next.js app in `admin/`, deployed at `admin.lociros.com` |
| Production | Vercel (frontend and admin) + Supabase (Postgres, Auth) + FastAPI in Docker on AWS Lightsail — see [deploy.md](./deploy.md) |

The FastAPI app is **synchronous**. NLP analyzers and SQLite are simpler without an async session. Generation takes 20–40 seconds, so it runs as a background job: `POST /generate` enqueues a row in `generation_jobs` and returns 202, and worker threads pick it up (see Generate below). There is no streaming.

## System diagram

```
┌─────────────────────────────┐     /api proxy          ┌─────────────────────────────┐
│  Next.js 16 (React 19)      │ ──────────────────────► │  FastAPI                    │
│  frontend/                  │                         │  backend/                   │
│  :3000                      │  SSR fetch for reader   │  :8000                      │
│                             │ ──────────────────────► │                             │
│  Shelf, Reader, Generate    │                         │  generate / validate / NLP  │
└─────────────────────────────┘                         └──────────────┬──────────────┘
                                                                       │
                                                                       ▼
                                                            SQLite (levla.db) or Postgres
                                                            data/*.json lexicons
                                                            OpenRouter (optional)

┌─────────────────────────────┐   server-side Bearer
│  admin/ (admin.lociros.com) │ ──────────────────────► /api/admin/overview
└─────────────────────────────┘
```

- The browser talks to `/api/...` on the Next origin. `frontend/src/app/api/[...path]/route.ts` proxies those paths to `NLP_BACKEND_URL` (default `http://127.0.0.1:8000`) at runtime. It sets `Authorization` from the Supabase session (ignoring any header the browser sent) and refuses admin, trial, and legacy-auth paths. Set `NEXT_PUBLIC_DEMO=1` to skip the proxy: the shelf and reader use a static catalog and `localStorage`.
- The admin app checks the Supabase user against `ADMIN_EMAIL` on the server, then calls FastAPI with that user's token; FastAPI checks `ADMIN_EMAILS` again.
- Stroke-order diagrams are a frontend-only route, `GET /kanji-strokes/{hex}`, which fetches a [KanjiVG](https://kanjivg.tagaini.net/) SVG and returns parsed path data. It does not go through the FastAPI proxy.
- Passage pages are **dynamic** (`force-dynamic`, `cache: "no-store"`). The Next server fetches `${NLP_BACKEND_URL}/api/passages/:id` at request time so the first paint already has tokens.
- CORS on FastAPI allows localhost by default and always includes `PUBLIC_BASE_URL`. Optional `CORS_ORIGIN_REGEX` covers Vercel preview URLs.
- Seed library + tap-to-gloss work **without** an OpenRouter key. Generation, LLM gloss fill, and translation require `OPENROUTER_API_KEY`.

## Repository layout

```
levla/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS, auth middleware, lifespan → init_db + workers
│   │   ├── worker.py               # dedicated generation-worker process (Compose `worker`)
│   │   ├── api/routes.py           # HTTP API
│   │   ├── core/config.py          # env (OpenRouter, DB, CORS, auth, flags, quotas)
│   │   ├── models/
│   │   │   ├── db.py               # SQLAlchemy tables, init_db, bootstrap
│   │   │   └── schemas.py          # Pydantic request/response models
│   │   └── services/
│   │       ├── generate.py         # generate, persist, quarantine, feedback, translation
│   │       ├── generation_jobs.py  # job queue, worker threads, stale-job reclaim
│   │       ├── quota.py            # monthly custom-passage cap
│   │       ├── rate_limit.py       # in-memory per-caller rate limits
│   │       ├── auth.py             # token → user, legacy cookie/magic/Google auth
│   │       ├── supabase_jwt.py     # Supabase access-token verification (JWKS)
│   │       ├── identity.py         # user/device identity, guest merge
│   │       ├── admin.py            # admin allowlist + overview
│   │       ├── trial.py            # funnel events + trial metrics
│   │       ├── placement.py        # placement read + scoring
│   │       ├── news.py             # daily news passage per band
│   │       ├── comprehension.py    # passage questions
│   │       ├── passport.py         # "why this level" calibration extras
│   │       ├── srs.py              # SM-2 review cards
│   │       ├── anki_export.py      # CSV + .apkg export
│   │       ├── tts.py              # Azure Speech audio (used by scripts/batch_catalog.py)
│   │       ├── audio_store.py      # MP3s on local disk (AUDIO_DIR)
│   │       ├── catalog_ja.py       # authored Japanese catalog seed
│   │       ├── sentences.py        # sentence split + English alignment
│   │       ├── llm.py              # OpenRouter: passage, gloss, translate
│   │       ├── morph.py            # language dispatcher + Russian
│   │       ├── morph_ja.py         # Sudachi
│   │       ├── morph_it.py         # spaCy Italian
│   │       ├── morph_ar.py         # CAMeL Tools MSA
│   │       ├── validator.py        # Russian CEFR + ja/it/ar dispatch
│   │       ├── validator_ja.py     # Japanese constructions
│   │       ├── validator_it.py     # Italian constructions
│   │       ├── validator_ar.py     # Arabic constructions
│   │       ├── gloss.py            # lexicon + LLM fill
│   │       ├── kanji.py            # reading alignment + KANJIDIC2 details
│   │       ├── roots.py            # Arabic جذر + وزن
│   │       ├── grammar.py          # colour roles + Japanese verb suffixes
│   │       ├── learner.py          # placement, lemmas, next-id
│   │       ├── library.py          # shelf payload
│   │       ├── data.py             # load grammar / vocab / gloss JSON
│   │       ├── seed.py             # hand-authored library
│   │       └── seed_translations.py
│   ├── alembic/versions/           # schema migrations (0001–0007)
│   ├── tests/
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── entrypoint.sh               # uvicorn with WEB_CONCURRENCY workers
│   └── .env.example
├── frontend/
│   ├── src/app/                    # landing, /library, /passage/[id], /placement, /review, /privacy, /terms
│   ├── src/app/api/[...path]/      # /api proxy to FastAPI
│   ├── src/app/auth/callback/      # Supabase code exchange
│   ├── src/app/kanji-strokes/      # KanjiVG proxy for stroke-order diagrams
│   ├── src/components/             # Shelf, Reader, GenerateForm, GlossCard, StrokeOrder, landing/
│   ├── src/lib/                    # API client, types, device id, Supabase clients, demo catalog
│   ├── src/proxy.ts                # Supabase session refresh
│   ├── public/sw.js                # service worker
│   └── Dockerfile
├── admin/                          # admin dashboard (Next.js), admin.lociros.com
├── data/
│   ├── grammar/{ru,ja,it,ar}_cefr.json
│   ├── vocab/{ru,ja,it,ar}_cefr.json
│   ├── gloss/{ru,ja,it,ar}_en.json
│   ├── roots/ar.json
│   └── kanji/ja.json
├── scripts/
│   ├── build_lexicon.py            # Russian vocab + gloss
│   ├── build_ja_lexicon.py         # Japanese vocab + gloss
│   ├── build_it_lexicon.py         # Italian vocab + gloss
│   ├── build_ar_lexicon.py         # Arabic vocab + gloss + roots
│   ├── build_kanji.py              # KANJIDIC2 + KRADFILE + JLPT → ja.json
│   ├── batch_catalog.py            # offline catalog generation + audio
│   ├── lightsail-run.sh            # run the API container on Lightsail
│   └── lightsail-set-db-password.sh
├── .github/workflows/ci.yml        # pytest, frontend lint, admin lint+build, Docker builds
├── docs/
└── docker-compose.yml
```

## Persistence

The schema is created on startup. `init_db()` runs under a Postgres advisory lock so several processes do not race:

1. `create_all` for every mapped table (creates missing tables only).
2. `_ensure_sqlite_columns` adds known late columns to tables that already exist (on SQLite and Postgres).
3. If there is no `alembic_version` table yet, stamp Alembic at `head`.
4. On Supabase, lock down the `public` schema (RLS, no anon grants).
5. Unless `SKIP_SEED=true`: `seed_library()` writes or repairs the hand-authored starter set, and `seed_catalog()` writes the Japanese catalog.

Startup never runs `alembic upgrade`. A migration that does more than add a table or one of the listed columns (an index, a constraint, a data fix) has to be applied by hand: `cd backend && alembic upgrade head`.

### Tables

| Table | Role |
| ----- | ---- |
| `passages` | Full text, token JSON, calibration JSON, optional English, `shelf_status` (`public` / `quarantine`), audio, series, comprehension, news source |
| `feedback` | Raw too-easy / just-right / too-hard events |
| `users` | App profile. `auth_id` uniquely references `auth.users.id` |
| `magic_links` | Legacy one-time sign-in tokens (development only) |
| `learners` | Current CEFR placement per `(device_id, language)`, plus the rating streak. Default **A2** |
| `learner_lemmas` | Content-word lemmas seen after finishing a text |
| `learner_taps` | Lemmas opened in the gloss |
| `learner_stars` | Lemmas saved from the gloss |
| `learner_cards` | SM-2 review card per saved lemma |
| `learner_reads` | Passages already read, unique on `(device_id, passage_id)` |
| `learner_news_saves` | Saved daily news passages |
| `news_issues` | One news passage per UTC day, language, and band |
| `trial_events` | Funnel and comprehension events |
| `generate_quota` | Custom passages used per account key per month |
| `generation_jobs` | Queued, running, completed, and failed generation jobs |

`passages.id` is a UUID string. Tokens and calibration are stored as JSON text, not normalized rows — the reader always loads a complete analyzed passage. Audio MP3s live on disk under `AUDIO_DIR`, not in the database.

Default local URL: `sqlite:///{backend}/levla.db` (the file `backend/levla.db`). Compose sets `postgresql://levla:levla@postgres:5432/levla`. Production uses the Supabase **session pooler** (`sslmode=require`).

## Request flow

### Shelf load

1. Client reads `lociros.language` (default `ja`) and `lociros.device_id` from `localStorage`.
2. `GET /api/library?language=ja|ru|it|ar` with `X-Device-Id`.
3. Backend loads placement, seen lemmas, read IDs; scores new vs. known tokens per passage; picks `next_id`.
4. Client splits items into **Continue** (the `next_id` card) and **The shelf**.

### Reader load

1. Next.js SSR: `GET {NLP_BACKEND_URL}/api/passages/{id}` with `cache: "no-store"`. 404 → `not-found.tsx`.
2. Client hydrates `Reader` with that payload (tokens already attached).
3. Client also calls `GET /api/passages/{id}/stats` with `X-Device-Id` for new/known counts and next-id (optional; a direct URL still works if this fails).

### Generate

1. `POST /api/generate` `{ level, topic, genre?, language }` needs an identity (a signed-in user, or a device id unless `REQUIRE_AUTH=true`). It returns **200** with a cached `PassageResponse` when the same topic was already generated. Otherwise it charges the monthly quota, checks the pending-job limit, and returns **202** with a job.
2. Background worker threads (`GENERATE_WORKERS` per API process, or the dedicated `worker` service) claim jobs with `FOR UPDATE SKIP LOCKED` and run the LLM + validate + persist pipeline. Once a minute a worker marks jobs stuck in `running` for over 10 minutes as failed.
3. Client polls `GET /api/generate/{job_id}` every 1.5 s until `status` is `completed` or `failed`, and gives up after three minutes.
4. On fail: rewrite at lower temperature with flags; keep the less-severe attempt. A draft that still fails is stored as quarantined and never shown.
5. Best-effort English translation.
6. Persist. The job response carries the full `PassageResponse`, and the frontend navigates to `/passage/{id}`.

Expected wait: **20–40 seconds**. Reads and shelf loads are not blocked while generation runs.

### Feedback

1. `POST /api/feedback` `{ passage_id, rating }` + `X-Device-Id`.
2. Always writes a `feedback` row.
3. If there is an identity: ingest unique content lemmas, mark read, update the rating streak (three too-easy or too-hard in a row move placement one step; just right clears it), pick next unread id.
4. Reader shows “Saved. Your {language} level is {placement}.” plus **Read next**.

## Frontend routing

| Route | File | Notes |
| ----- | ---- | ----- |
| `/` | `src/app/page.tsx` | Landing page (`components/landing/*`); runs the real reader on a hand-authored sample |
| `/variants/[variant]` | `src/app/variants/[variant]/page.tsx` | Landing variants for testing, `noindex` |
| `/library` | `src/app/library/page.tsx` | `Shelf` |
| `/placement` | `src/app/placement/page.tsx` | Placement read |
| `/review` | `src/app/review/page.tsx` | SM-2 review of saved words |
| `/privacy`, `/terms` | `src/app/privacy/page.tsx`, `src/app/terms/page.tsx` | Legal copy |
| `/auth/callback` | `src/app/auth/callback/route.ts` | Supabase code exchange; `next` must be a same-origin path |
| `/api/*` | `src/app/api/[...path]/route.ts` | Proxy to FastAPI |
| `/health` | `src/app/health/route.ts` | Frontend liveness |
| `/passage/[id]` | `src/app/passage/[id]/page.tsx` | SSR passage fetch, `dynamic = "force-dynamic"` |
| `/passage/[id]` loading | `src/app/passage/[id]/loading.tsx` | Skeleton bars |
| `/kanji-strokes/[code]` | `src/app/kanji-strokes/[code]/route.ts` | KanjiVG proxy → JSON path data |
| unmatched | `src/app/not-found.tsx` | “Passage gone” |

There is no generate route of its own. Restock is a disclosure on the shelf.

Client-only modules (`shelf.tsx`, `reader.tsx`, `generate-form.tsx`) use `"use client"`. The API helper in `src/lib/api.ts` unwraps FastAPI `detail` strings (and validation-error arrays) into `Error` messages.

## Environment

**Backend** (`backend/.env`, see `backend/.env.example`)

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `OPENROUTER_API_KEY` | empty | Required for `/generate`, LLM gloss fill, and translation |
| `LLM_MODEL` | `openai/gpt-4o-mini` | OpenRouter model id |
| `DATABASE_URL` | SQLite at `backend/levla.db` | SQLAlchemy URL. `postgres://` is rewritten to `postgresql+psycopg2://`. Supabase hosts get `sslmode=require` if unset |
| `DB_SSLMODE` | empty | Set `require` for hosted Postgres; inferred for Supabase URLs |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated. `PUBLIC_BASE_URL` is always included |
| `CORS_ORIGIN_REGEX` | empty | Optional regex, e.g. `https://.*\.vercel\.app` |
| `APP_ENV` | `development` | `production` requires a real `JWT_SECRET`, sets `Secure` cookies, turns off `/docs`, and turns off the legacy magic-link and Google routes |
| `JWT_SECRET` | `dev-change-me` | Signs legacy auth cookies |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Public origin (OAuth, CORS, OpenRouter referer) |
| `SUPABASE_URL` | empty | `https://PROJECT.supabase.co`. Inferred from a direct `db.*.supabase.co` database host |
| `ADMIN_EMAILS` | empty | Comma-separated emails allowed on admin routes. Empty means nobody |
| `REQUIRE_AUTH` | `false` | Generation needs a signed-in account |
| `GENERATE_MONTHLY_CAP` | `10` | Custom passages per identity per month (always enforced) |
| `GENERATE_WORKERS` | `2` | Generation threads per API process (`0` to leave it to the worker service) |
| `GENERATE_MAX_PENDING` | `3` | Unfinished jobs per identity |
| `SHOW_RUSSIAN` / `SHOW_ITALIAN` / `SHOW_ARABIC` | `true` | Set `false` to hide a language |
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` / `AZURE_SPEECH_VOICE` | empty / empty / `ja-JP-NanamiNeural` | Audio for `scripts/batch_catalog.py` |
| `AUDIO_DIR` | `backend/audio` | Where MP3s are written and served from |
| `SKIP_SEED` | `false` | Skip the seed library and catalog on startup |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` / `DB_POOL_RECYCLE` | `5` / `10` / `600` | SQLAlchemy pool |
| `COOKIE_SECURE` / `COOKIE_SAMESITE` / `COOKIE_DOMAIN` | production / `lax` / empty | Legacy auth cookie |
| `LOG_LEVEL` | `info` | |

Data files default to `{repo}/data`. Override with `DATA_DIR`. `WEB_CONCURRENCY` (read by `entrypoint.sh`, default 2) sets the uvicorn worker count.

**Frontend**

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `NLP_BACKEND_URL` | `http://127.0.0.1:8000` | Backend origin for `/api` proxy and SSR passage fetch (runtime) |
| `NEXT_PUBLIC_SUPABASE_URL` | empty | Supabase project URL for Auth |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | empty | Publishable key (never the secret). `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works |
| `NEXT_PUBLIC_DEMO` | empty | Static catalog + `localStorage`. Set to `1` at build time to skip FastAPI |
| `NEXT_PUBLIC_STICKY_START_TEST` | empty | Enables the phone sticky Start button A/B test |

**Admin** (`admin/.env.example`): `ADMIN_EMAIL` (required; unset locks everyone out), `NLP_BACKEND_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ADMIN_TIME_ZONE` (default `America/New_York`).

The frontend Docker image defaults `NLP_BACKEND_URL=http://backend:8000`. Compose can override it without rebuilding. On Vercel, set `NLP_BACKEND_URL` to the public FastAPI origin.

## Docker

```
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000 (`/health`, `/api/health/ready`, `/docs`)
- `backend/.env` must exist
- Postgres: volume `levla-pg`
- Audio: volume `levla-audio`

Backend image copies `backend/` **and** `data/` so lexicons are available at `/app/data`. Frontend image is a standalone Next.js build (`deps` → `builder` → `runner`).

Compose also runs a `worker` service (`python -m app.worker`, `SKIP_SEED=true`) that processes generation jobs. The admin app is not in Compose; run it with `cd admin && npm run dev` (port 3100).

Production (Vercel + Supabase + FastAPI on Lightsail) is documented in [deploy.md](./deploy.md).

## Tests

From `backend/` with the venv active (`pytest.ini` sets `pythonpath = .`):

```
cd backend && pytest
```

| File | Covers |
| ---- | ------ |
| `tests/test_validator.py` | Russian lemmas/cases; A1 rejects past, accusative, *если*; A2 allows acc, rejects instrumental |
| `tests/test_validator_ja.py` | です/ます A1; て-form A1 vs A2; ている A2 vs B1; keigo B1 vs B2; core gloss |
| `tests/test_kanji.py` | Reading alignment: 市場, 学生, 食べる, 本; dictionary fields on 本 / 語 |
| `tests/test_grammar.py` | は/が/を roles; 食べました / 食べる / て-いる / 行かない chains; Russian, Italian, and Arabic verb vs preposition |
| `tests/test_validator_it.py` | Present A1; passato prossimo A1 vs A2; congiuntivo B1 vs B2 |
| `tests/test_validator_ar.py` | Present A1; past A1 vs A2; Form II A1; إنّ A2 vs B1; passive B1 vs B2 |
| `tests/test_roots.py` | BW root → Arabic; Form I–X mapping; morph_from_analysis tense/case |
| `tests/test_learner.py` | Placement bump, just-right no bump, new/known counts, next-id skip of already-read, star/unstar |
| `tests/test_sentences.py` | Japanese sentence index on 。; Italian and Arabic sentence index on `.`; Arabic `؟`; English split on `. ` |
| `tests/test_translation.py` | Every seed title has a non-empty English translation; persist path stores it |
| `tests/test_quarantine.py` | Failed drafts are quarantined and hidden from library and Continue |
| `tests/test_generation_jobs.py` | Enqueue, claim, pending limit, job completion, ownership |
| `tests/test_routes_security.py` | HTTP-level: legacy auth off in production, single-use magic links, generate identity and monthly cap, translation identity, admin-only `lab`, stale-job reclaim, rate limits |
| `tests/test_guest_merge.py` | Guest rows merge onto the account without overwriting a placed band |
| `tests/test_srs.py` | SM-2 scheduling |
| `tests/test_placement_news.py` | Placement scoring, news held to level |
| `tests/test_admin.py`, `tests/test_trial.py` | Admin allowlist and overview, funnel metrics |
| `tests/test_supabase_auth.py` | Supabase token verification |
| `tests/test_config.py` | URL normalization, SSL mode, pooler detection |
| `tests/test_catalog.py`, `tests/test_shelf_counts.py`, `tests/test_audio_store.py` | Japanese catalog seed, shelf counts, audio storage |

Tests do **not** call OpenRouter. Gloss attach in tests uses `use_llm=False`. `tests/conftest.py` points `DATABASE_URL` at a temporary SQLite file before the app is imported, so tests never touch a real database. There are no frontend tests; CI runs frontend lint and admin lint + build.

## Adding a language

Supported codes: `ja`, `it`, `ru`, and `ar`, all public by default (`SHOW_*=false` hides one). A further language needs:

1. `data/grammar/{code}_cefr.json`
2. `data/vocab/{code}_cefr.json` and `data/gloss/{code}_en.json`
3. A morph module and a validator
4. Seed texts + translations
5. UI labels in `frontend/src/lib/types.ts`
6. `SUPPORTED` in `backend/app/services/data.py` and `SUPPORTED_LANGUAGES` / `require_language` in `backend/app/api/routes.py`
7. A row in `frontend/src/lib/seal-copy.ts` (`script`, pass word, fail word). Prefer a short exam-stamp word (about 2–8 letters or 2–4 CJK). Missing keys fall back to Latin PASS / FAIL; do not ship a blank seal. Script picks the typeface (`cjk` → gothic, `cyrillic` / `latin` → Literata, `arabic` → Noto Naskh). Set `rtl: true` for right-to-left scripts; the passage, title, and seal then use `dir="rtl"`.

Arabic also ships `data/roots/ar.json` and `roots.py` (the gloss-card analog of kanji). The Docker image downloads CAMeL morphology into `CAMELTOOLS_DATA`. Arabic is on the shelf unless `SHOW_ARABIC=false`.

Grammar and vocab JSON are loaded with `lru_cache`. Restart the backend after editing them.

## Limitations that follow from the architecture

- **SQLite** is fine for local development. Compose uses local Postgres. Production uses Supabase.
- **Generation is async.** `POST /generate` enqueues a job; worker threads process it. Each API process starts `GENERATE_WORKERS` threads, so the total is `WEB_CONCURRENCY × GENERATE_WORKERS` plus any worker container. Production runs one process with two threads.
- **Rate limits are per process.** They live in memory and reset on restart.
- **Accounts are optional.** Guest progress is a device UUID. After Supabase sign-in, FastAPI merges that device into `public.users`, keeping the account's row wherever both have one.
- **Quarantine.** A generated passage that still violates the ruleset after its rewrite is stored but hidden. Calibration is a gate with a retry.
- **Analyzer errors** become CEFR errors: the wrong lemma or POS will flag or miss constructions.

## Known gaps

Found in the September 2026 sweep and not fixed yet. Critical and high findings (legacy auth in production, unmetered generation and translation, the open redirect in `/auth/callback`, the public `lab` flag, stuck jobs, missing rate limits) were fixed then. The October 2026 launch pass fixed the legacy HS256 verifier (off in production), trusted forwarded IPs (host and Docker bridges only, behind Caddy), the uncapped `/events` payload, the quota race (one conditional `UPDATE`), missing security headers, robots, and sitemap, partial `DELETE /me`, `.tmp-ref/`, the missing delete button and contact address, and the landing picker ignoring `SHOW_*`.

**Security and abuse**

- **Comprehension answers ship to the client.** `PassageResponse.comprehension` includes `answer_index`, so the quiz can be read from the network tab. It only feeds the learner's own placement, so the harm is self-inflicted.
- **Guest merge trusts `X-Device-Id`.** On sign-in, whatever device id the browser sends is merged into the account. Anyone who learns another guest's device id can pull that guest's progress into their own account.
- **Rate limits are in memory, per process.** They reset on restart and are not shared across processes.
- **Per-IP limits see Vercel, not the reader.** Browser traffic reaches FastAPI through the Vercel proxy, so the per-IP window groups readers by Vercel egress. The per-identity window is the real limit.
- **CSP allows inline scripts.** Next's bootstrap and the service-worker registration are inline, so `script-src` includes `'unsafe-inline'`. Moving to nonces would tighten it.
- **The guest allowance is per device.** Clearing site data gives a guest another free passage. Generation, translation, and review stay behind an account.

**Data**

- **No per-user unique indexes.** Unique constraints on learner tables are on `device_id` only. Code reads the oldest row for a `user_id`, but duplicates can still be written by a race.
- **No automatic migrations.** Startup runs `create_all` plus a fixed column patch, never `alembic upgrade`, because the migrations are not idempotent against databases that `create_all` already built. Apply new migrations by hand.

**Product**

- **Service worker caches navigations.** Offline fallback serves the last cached copy of a page, which can show stale shelf state after coming back online until the next network response.
- **Thin catalogs outside Japanese.** At launch Russian, Italian, and Arabic have 8 to 16 public passages each against 180 for Japanese, with little or no B2. Grow them with `scripts/batch_catalog.py --levels A1,A2,B1,B2` or hide them with `SHOW_*=false` before taking money for them.
- **Billing state is mirrored, not queried.** Entitlement reads the `users` columns the webhook keeps up to date. A missed webhook leaves a stale status until the next event; Stripe retries failed deliveries for three days.
- **Effects that set state synchronously.** Eight effects in `generate-form`, `placement`, `reader`, `seal`, `shelf`, and `stroke-order` trip `react-hooks/set-state-in-effect`. The rule is downgraded to a warning in `frontend/eslint.config.mjs` so CI lint passes; fix them and restore it to an error.
- **Audio is offline-only.** Only catalog texts that `scripts/batch_catalog.py` voiced have audio; generated passages never do.
