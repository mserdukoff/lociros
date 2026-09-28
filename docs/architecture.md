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
| Production | Vercel (Next.js) + Supabase (Postgres) + FastAPI on a Docker host — see [deploy.md](./deploy.md) |

The FastAPI app is **synchronous**. NLP analyzers and SQLite are simpler without an async session. Generation is a blocking request that can take 20–40 seconds; there is no job queue or streaming.

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
                                                            SQLite (levla.db)
                                                            data/*.json lexicons
                                                            OpenRouter (optional)
```

- The browser talks to `/api/...` on the Next origin. `frontend/src/app/api/[...path]/route.ts` proxies those paths to `NLP_BACKEND_URL` (default `http://127.0.0.1:8000`) at runtime. Set `NEXT_PUBLIC_DEMO=1` to skip the proxy: the shelf and reader use a static catalog and `localStorage`.
- Stroke-order diagrams are a frontend-only route, `GET /kanji-strokes/{hex}`, which fetches a [KanjiVG](https://kanjivg.tagaini.net/) SVG and returns parsed path data. It does not go through the FastAPI proxy.
- Passage pages are **dynamic** (`force-dynamic`, `cache: "no-store"`). The Next server fetches `${NLP_BACKEND_URL}/api/passages/:id` at request time so the first paint already has tokens.
- CORS on FastAPI allows localhost by default and always includes `PUBLIC_BASE_URL`. Optional `CORS_ORIGIN_REGEX` covers Vercel preview URLs.
- Seed library + tap-to-gloss work **without** an OpenRouter key. Generation, LLM gloss fill, and translation require `OPENROUTER_API_KEY`.

## Repository layout

```
levla/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS, lifespan → init_db
│   │   ├── api/routes.py           # HTTP API
│   │   ├── core/config.py          # env (OpenRouter, DB, CORS, data dir)
│   │   ├── models/
│   │   │   ├── db.py               # SQLAlchemy tables
│   │   │   └── schemas.py          # Pydantic request/response models
│   │   └── services/
│   │       ├── generate.py         # generate, persist, feedback, translation
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
│   ├── tests/
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/app/                    # `/` landing, `/library` shelf, `/passage/[id]` reader
│   ├── src/app/kanji-strokes/      # KanjiVG proxy for stroke-order diagrams
│   ├── src/components/             # Shelf, Reader, GenerateForm, GlossCard, StrokeOrder
│   ├── src/lib/                    # API client, types, device id, KanjiVG parser
│   ├── next.config.ts              # /api rewrite
│   └── Dockerfile
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
│   └── build_kanji.py              # KANJIDIC2 + KRADFILE + JLPT → ja.json
├── docs/
└── docker-compose.yml
```

## Persistence

SQLite is created on startup. `init_db()`:

1. `create_all` for the five tables.
2. If an older file is missing `passages.language` or `passages.translation`, those columns are added.
3. `seed_library()` writes or repairs the hand-authored starter set.

### Tables

| Table | Role |
| ----- | ---- |
| `passages` | Full text, token JSON, calibration JSON, optional English, metadata |
| `feedback` | Raw too-easy / just-right / too-hard events (not keyed to device) |
| `learners` | Current CEFR placement per `(device_id, language)`. Default **A2** |
| `learner_lemmas` | Content-word lemmas seen after finishing a text |
| `learner_stars` | Lemmas saved from the gloss |
| `learner_reads` | Passages already read, unique on `(device_id, passage_id)` |
| `users` | App profile. `auth_id` uniquely references `auth.users.id` |

`passages.id` is a UUID string. Tokens and calibration are stored as JSON text, not normalized rows — the reader always loads a complete analyzed passage.

Default local URL: `sqlite:///./backend/levla.db`. Compose sets `postgresql://levla:levla@postgres:5432/levla`. Production uses the Supabase **session pooler** (`sslmode=require`).

## Request flow

### Shelf load

1. Client reads `lociros.language` (default `ja`) and `lociros.device_id` from `localStorage`.
2. `GET /api/library?language=ja|ru` with `X-Device-Id`.
3. Backend loads placement, seen lemmas, read IDs; scores new vs. known tokens per passage; picks `next_id`.
4. Client splits items into **Continue** (the `next_id` card) and **The shelf**.

### Reader load

1. Next.js SSR: `GET {NLP_BACKEND_URL}/api/passages/{id}` with `cache: "no-store"`. 404 → `not-found.tsx`.
2. Client hydrates `Reader` with that payload (tokens already attached).
3. Client also calls `GET /api/passages/{id}/stats` with `X-Device-Id` for new/known counts and next-id (optional; a direct URL still works if this fails).

### Generate

1. `POST /api/generate` `{ level, topic, genre?, language }` returns **202** with `{ job_id, status: "pending" }`, or **200** with a cached `PassageResponse` when the same topic was already generated.
2. Background worker threads (or a dedicated `worker` service) claim jobs from Postgres with `FOR UPDATE SKIP LOCKED` and run the LLM + validate + persist pipeline.
3. Client polls `GET /api/generate/{job_id}` until `status` is `completed` or `failed`.
4. On fail: rewrite at lower temperature with flags; keep the less-severe attempt.
5. Best-effort English translation.
6. Persist and return the full `PassageResponse`. Frontend navigates to `/passage/{id}`.

Expected wait: **20–40 seconds**. Reads and shelf loads are no longer blocked while generation runs.

### Feedback

1. `POST /api/feedback` `{ passage_id, rating }` + `X-Device-Id`.
2. Always writes a `feedback` row.
3. If the device id is valid: ingest unique content lemmas, mark read, bump placement one step, pick next unread id.
4. Reader shows “Saved. Your {language} level is {placement}.” plus **Read next**.

## Frontend routing

| Route | File | Notes |
| ----- | ---- | ----- |
| `/` | `src/app/page.tsx` | Landing page (`components/landing/*`); runs the real reader on a hand-authored sample |
| `/library` | `src/app/library/page.tsx` | `Shelf` |
| `/review` | `src/app/review/page.tsx` | Saved-word review |
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
| `DATABASE_URL` | `sqlite:///./levla.db` | SQLAlchemy URL. `postgres://` is rewritten to `postgresql+psycopg2://`. Supabase hosts get `sslmode=require` if unset |
| `DB_SSLMODE` | empty | Set `require` for hosted Postgres; inferred for Supabase URLs |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated. `PUBLIC_BASE_URL` is always included |
| `CORS_ORIGIN_REGEX` | empty | Optional regex, e.g. `https://.*\.vercel\.app` |
| `APP_ENV` | `development` | `production` requires a real `JWT_SECRET` and sets `Secure` cookies |
| `JWT_SECRET` | `dev-change-me` | Signs auth cookies |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Public origin (OAuth, CORS, OpenRouter referer) |
| `SUPABASE_URL` | empty | `https://PROJECT.supabase.co`. Inferred from a direct `db.*.supabase.co` database host |

Data files default to `{repo}/data`. Override with `DATA_DIR`.

**Frontend**

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `NLP_BACKEND_URL` | `http://127.0.0.1:8000` | Backend origin for `/api` proxy and SSR passage fetch (runtime) |
| `NEXT_PUBLIC_SUPABASE_URL` | empty | Supabase project URL for Auth |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | empty | Publishable key (never the secret). `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works |
| `NEXT_PUBLIC_DEMO` | empty | Static catalog + `localStorage`. Set to `1` at build time to skip FastAPI |

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

Production (Vercel + Supabase + a Docker API host) is documented in [deploy.md](./deploy.md).

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

Tests do **not** call OpenRouter. Gloss attach in tests uses `use_llm=False`. There are no frontend tests.

## Adding a language

Supported codes: `ja` (public), `it`, `ru`, and `ar` (env-flagged). A further language needs:

1. `data/grammar/{code}_cefr.json`
2. `data/vocab/{code}_cefr.json` and `data/gloss/{code}_en.json`
3. A morph module and a validator
4. Seed texts + translations
5. UI labels in `frontend/src/lib/types.ts`
6. `SUPPORTED` in `backend/app/services/data.py` and language checks on `/library`
7. A row in `frontend/src/lib/seal-copy.ts` (`script`, pass word, fail word). Prefer a short exam-stamp word (about 2–8 letters or 2–4 CJK). Missing keys fall back to Latin PASS / FAIL; do not ship a blank seal. Script picks the typeface (`cjk` → gothic, `cyrillic` / `latin` → Literata, `arabic` → Noto Naskh). Set `rtl: true` for right-to-left scripts; the passage, title, and seal then use `dir="rtl"`.

Arabic also ships `data/roots/ar.json` and `roots.py` (the gloss-card analog of kanji). The Docker image downloads CAMeL morphology into `CAMELTOOLS_DATA`. Arabic is on the shelf unless `SHOW_ARABIC=false`.

Grammar and vocab JSON are loaded with `lru_cache`. Restart the backend after editing them.

## Limitations that follow from the architecture

- **SQLite** is fine for a single-user demo. Compose uses local Postgres. Production uses Supabase.
- **Generation is async.** `POST /generate` enqueues a job; worker threads process it. Scale with `GENERATE_WORKERS` per process and/or a dedicated worker container.
- **Accounts are optional.** Guest progress is a device UUID. After Supabase sign-in, FastAPI merges that device into `public.users`, keeping the account's row wherever both have one. `feedback` rows are not device-scoped.
- **Soft fail.** A passage that still violates the ruleset is stored and readable, with a warning. Calibration is a gate with a retry, not a hard reject.
- **Analyzer errors** become CEFR errors: the wrong lemma or POS will flag or miss constructions.
