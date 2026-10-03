# HTTP API

Base path: `/api`. FastAPI OpenAPI: `http://localhost:8000/docs` when the backend is running outside production. With `APP_ENV=production`, `/docs`, `/redoc`, and `/openapi.json` are off.

The Next.js app proxies `/api/*` to the backend through the route handler `frontend/src/app/api/[...path]/route.ts`. The proxy:

- sets `Authorization` from the Supabase session cookie and drops any `Authorization` header the browser sent;
- returns 404 for `admin/*`, `trial/*`, `auth/google*`, and `auth/magic*`, which the public app never calls (the admin app talks to FastAPI directly from its server).

Passage SSR bypasses the proxy and calls `NLP_BACKEND_URL` directly. In production, Vercel holds that proxy; FastAPI is a separate origin.

## Headers

| Header | Used by | Notes |
| ------ | ------- | ----- |
| `X-Device-Id` | Every learner route | Must match `^[A-Za-z0-9_-]{8,64}$`. Invalid or missing → treated as anonymous (default placement A2, no lemma/read history). The browser stores a UUID in `localStorage` as `lociros.device_id`. **Required** (401 without it or a signed-in user) on `POST /generate` and `GET /passages/{id}/translation`, and on the write routes listed below. |
| `Authorization: Bearer` | signed-in requests | Supabase Auth access token, verified against the project's JWKS (ES256/RS256, audience `authenticated`). FastAPI also still accepts its legacy HS256 token signed with `JWT_SECRET`, in the header or the `lociros_token` cookie. |
| `Content-Type: application/json` | POST bodies | |

"Identity" below means a signed-in user or a valid `X-Device-Id`. Signed-in lookups use the user id; otherwise the device id.

CORS: `CORS_ORIGINS` (default localhost:3000). `PUBLIC_BASE_URL` is always included. Optional `CORS_ORIGIN_REGEX` for Vercel preview hosts. Credentials are allowed; methods and headers are open (`*`).

## Endpoints

| Method | Path | Body / query | Success |
| ------ | ---- | ------------ | ------- |
| `GET` | `/health` | | `{ "ok": true, "name": "lociros" }` (also served at `/health` outside `/api`) |
| `GET` | `/health/ready` | | `{ "ok": true, "name": "lociros", "db": true }` — 500 if the database is down |
| `GET` | `/me` | optional Bearer + `X-Device-Id` | `MeResponse`: `authenticated`, `email`, `display_name`, `guest`, `show_*` flags, `generate_remaining` (null without an identity), `require_auth`, `admin`, `created_at`, and `entitlement` (see below) |
| `PATCH` | `/me` | `{ display_name }` + Bearer | Updated `MeResponse` |
| `DELETE` | `/me` | Bearer (required) | Cancels any Stripe subscription immediately, deletes every row the account owns (learner state, words, cards, reads, taps, news saves, events, feedback, generation jobs, quota, model usage, magic links), then the Supabase login |
| `GET` | `/me/export` | Bearer | JSON download of everything stored for the account |
| `POST` | `/billing/checkout` | `{ plan: "monthly"\|"annual", return_to? }` + Bearer | `{ url }` for Stripe Checkout. If more than two days of the free week remain, the first charge waits until it ends. 503 if Stripe is not configured. Rate limited |
| `POST` | `/billing/portal` | Bearer | `{ url }` for the Stripe customer portal. 400 if the account never subscribed |
| `POST` | `/billing/webhook` | raw Stripe event + `Stripe-Signature` | `{ ok }`. Verified against `STRIPE_WEBHOOK_SECRET`; each event id is applied once |
| `POST` | `/auth/session` | Bearer (required) + `X-Device-Id` | Merges this browser's guest rows into the signed-in user; records `account_linked` |
| `POST` | `/auth/logout` | | Clears the legacy FastAPI cookie. Supabase sign-out happens in the browser |
| `GET` | `/auth/google`, `/auth/google/callback` | | Legacy Google cookie sign-in. **404 in production** |
| `POST` | `/auth/magic` | `{ email }` | Legacy magic link. Returns `{ ok, link }` (no email is sent). **404 in production** |
| `GET` | `/auth/magic/callback?token=` | | Consumes a magic link once, sets the cookie, redirects to `/library`. **404 in production** |
| `POST` | `/generate` | `{ level, topic, genre?, language }` + identity | **200** cached `PassageResponse`, or **202** `GenerateJobResponse`. Rate limited |
| `GET` | `/generate/{job_id}` | identity that created the job | `GenerateJobResponse` — poll until `completed` or `failed`. 404 for other callers |
| `GET` | `/library?language=ja\|ru\|it\|ar` | `X-Device-Id` | `LibraryResponse`. With an identity, also schedules today's news passage for that band |
| `GET` | `/shelf/counts` | | `{ counts: { ja: n, … } }`: passages a reader can open (public, passed calibration, not news), public languages only. Cached ten minutes in-process. The landing page's proof line |
| `POST` | `/events` | `{ kind, passage_id?, payload? }` + `X-Device-Id` | `{ "ok": true }`. Browser-side funnel events: `landing_view`, `demo_tap`, `start_click`, `placement_start`, `session_start`, `paywall_view`. **400** for the kinds the API records itself (`placement_done`, `read_complete`, `account_linked`, `comprehension`, `trial_start`, `checkout_start`, `subscribed`, `churned`). `payload` is capped at 2 KB of JSON. Rate limited |
| `GET` | `/admin/overview` | Bearer (admin) | `AdminOverview`: API status, totals, last 7 days, funnel, revenue (`trial.billing`), top model usage (`llm_usage`), counts, recent users with their plan, and recent jobs. Read by the admin app at `admin.lociros.com` |
| `GET` | `/trial/metrics?days=30` | Bearer (admin) | Trial gates plus `funnel`: per-step devices and rates against landing views, 2- and 7-day returns, and `sticky_test` arms |
| `GET` | `/placement?language=ja\|ru\|it\|ar` | | Placement passage and questions, without the answer key |
| `POST` | `/placement` | `{ language, answers }` + identity | `{ language, level, correct, total, placed, next_id }`. `next_id` is the passage the result screen opens |
| `POST` | `/placement/choose` | `{ language, level }` + identity | Skips the read: the reader names their band (`A1`–`B2`) in onboarding. Same response with `correct` and `total` at `0`. 400 without an identity |
| `POST` | `/news/save` | `{ passage_id, language, saved }` + identity | `{ ok, saved }`. Saves or unsaves today's news passage |
| `POST` | `/taps` | `{ lemma, language, passage_id? }` + `X-Device-Id` | `{ "ok": true }` (ignored without an identity) |
| `POST` | `/comprehension` | `{ passage_id, answers }` + `X-Device-Id` | `{ ok, correct, total, detail }`. `detail` is one boolean per question. 400 unless every question is answered |
| `GET` | `/passages/{id}` | `?lab=1` for admins | `PassageResponse`. Quarantined passages are 404 unless `lab=1` is sent by a signed-in admin |
| `GET` | `/passages/{id}/translation` | identity | `{ passage_id, translation }`. Rate limited |
| `GET` | `/passages/{id}/stats` | `X-Device-Id` | `PassageStats` |
| `POST` | `/gloss` | `{ word, passage_id? }` | `GlossResponse`. Rate limited |
| `POST` | `/feedback` | `{ passage_id, rating }` + `X-Device-Id` | `FeedbackResponse` |
| `GET` | `/words?language=ja\|ru\|it\|ar` | `X-Device-Id` | `StarredWord[]` (`[]` without an identity) |
| `POST` | `/words` | `{ lemma, gloss?, passage_id?, language? }` + identity | `StarredWord`. Also creates or refreshes the SM-2 review card |
| `DELETE` | `/words` | `{ lemma, language }` + identity | `{ "ok": true }` |
| `GET` | `/words/export.csv?language=` | identity | CSV of saved words |
| `GET` | `/words/export.apkg?language=` | identity | Anki package of saved words |
| `GET` | `/review?language=` | `X-Device-Id` | `{ due, cards: ReviewCard[] }` (`{ due: 0, cards: [] }` without an identity) |
| `POST` | `/review` | `{ card_id, rating }` + identity | Grades one of the caller's cards (`again`, `hard`, `good`, `easy`) and returns the rescheduled `ReviewCard`. 404 for another caller's card |
| `GET` | `/audio/{id}.mp3` | | Stored passage audio (`audio/mpeg`) |

`language` defaults to `ja` wherever it is optional, including `POST /generate`.

### Paywall

With `PAYWALL_ENABLED` (on by default in production):

- A guest can open `FREE_GUEST_PASSAGES` passages (default 1, counted by finished reads on the device) plus the placement read. Opening another returns **402** `{ "detail": { "code": "signup_required", "message": … } }`.
- A new account gets a `TRIAL_DAYS` free week (default 7), no card. After it, passages, `/generate`, `/translation`, `POST /review`, and `/news/save` return **402** with `code: "subscription_required"` until a subscription is active.
- Stripe `active` and `trialing` count as subscribed. `past_due` keeps access while Stripe retries. Admins are always entitled.

`MeResponse.entitlement`: `{ status: "guest"|"trial"|"active"|"grace"|"expired", entitled, paywall, billing_ready, trial_ends_at, trial_days_left, plan, current_period_end, cancel_at_period_end, has_customer }`. The frontend turns a 402 into a redirect to `/pricing` (or the in-page paywall for server-rendered passages).

### Rate limits

Per identity (user, else device id, else client IP) in a sliding one-minute window, plus a shared per-IP window five times larger so rotating device ids does not escape it:

| Route | Per identity per minute |
| ----- | ----------------------- |
| `POST /generate` | 6 |
| `GET /passages/{id}/translation` | 30 |
| `POST /events` | 60 |
| `POST /gloss` | 120 |
| `POST /billing/checkout` | 10 |

The windows are in process memory. Production runs one API process (`WEB_CONCURRENCY=1`); with more processes each keeps its own window.

`POST /generate` is also capped at `GENERATE_MONTHLY_CAP` new passages per identity per calendar month (default 10), and at `GENERATE_MAX_PENDING` unfinished jobs (default 3). A cache hit on an existing topic does not count. With `REQUIRE_AUTH=true`, it additionally requires a signed-in user.

A translation that is missing or misaligned is generated at most once per passage per hour per process; otherwise the stored text (or 503) comes back.

### Status codes

| Code | When |
| ---- | ---- |
| 400 | `language` is not `ru`, `ja`, `it`, or `ar`; a write route without an identity; unanswered comprehension questions |
| 401 | No identity on `/generate` or `/translation`; `REQUIRE_AUTH` on and not signed in; account routes without a user |
| 402 | Paywall: `signup_required` (guest past the free passages) or `subscription_required` (free week over) |
| 413 | Request body over `MAX_BODY_BYTES` (default 256 KB) |
| 403 | Signed in but not in `ADMIN_EMAILS` on admin routes |
| 404 | Unknown or quarantined passage; Russian, Italian, or Arabic requested while `SHOW_RUSSIAN` / `SHOW_ITALIAN` / `SHOW_ARABIC` is off; legacy auth routes in production |
| 202 | `/generate` accepted; poll `/generate/{job_id}` |
| 429 | Rate limit, monthly generate cap, or too many pending generation jobs |
| 503 | Translation unavailable (LLM missing or failed, nothing stored); billing routes when Stripe is not configured |

A generation failure (including a missing `OPENROUTER_API_KEY`) is reported on the job: `status: "failed"` with a short `error`. Unexpected exceptions are logged on the server and reported as a generic message. A job left `running` for more than 10 minutes (a worker died) is marked failed.

Error body is FastAPI’s usual `{ "detail": "…" }` (string or validation-error list). The frontend concatenates `detail[].msg` when `detail` is an array.

## Generate

```json
{
  "level": "A2",
  "topic": "a quiet morning at the market",
  "genre": "daily_life",
  "language": "ja"
}
```

| Field | Type | Rules |
| ----- | ---- | ----- |
| `level` | `"A1" \| "A2" \| "B1" \| "B2"` | required |
| `topic` | string | 1–200 chars |
| `genre` | string or null | optional; UI uses `daily_life`, `travel`, `news`, `folklore`, `work` (max 40). Unknown values are stored but do not add a prompt hint |
| `language` | `"ru" \| "ja" \| "it" \| "ar"` | default `ja` |

The work (LLM + morph + optional rewrite + translation) runs on a background job, so the request returns 202 quickly and the client polls. Timeouts on the OpenRouter client are 45s per completion. The web client gives up polling after three minutes.

A completed job whose draft failed calibration is quarantined, so its `passage` is `null` on the job response.

## Passage (`PassageResponse`)

```json
{
  "id": "uuid",
  "language": "ja",
  "level": "A2",
  "topic": "a quiet morning at the market",
  "genre": "daily_life",
  "title": "市場の朝",
  "text": "…full source text…",
  "tokens": [ "…" ],
  "calibration": { "…" },
  "word_count": 86,
  "created_at": "2026-08-31T00:00:00Z",
  "translation": "In the morning…",
  "shelf_status": "public",
  "audio_url": null,
  "audio_cues": [],
  "series_id": null,
  "chapter_index": null,
  "comprehension": [{ "id": "q1", "prompt": "…", "choices": ["…", "…"], "answer_index": 0 }],
  "source_name": null,
  "source_url": null,
  "source_date": null
}
```

`word_count` is the number of `is_word` tokens, not whitespace-separated words. `audio_cues` are `{ start_ms, end_ms, text }` per sentence. `series_id` / `chapter_index` link chapters of one story. `source_*` are set on daily news passages. `comprehension` includes `answer_index`, so the reader can show the right answer after **Check**; it is a self-check, not a graded test.

### Token

What the reader clicks.

```json
{
  "text": "市場",
  "ws": "に",
  "is_word": true,
  "lemma": "市場",
  "morph": {
    "lemma": "市場",
    "pos": "noun",
    "case": null,
    "gender": null,
    "number": null,
    "tense": null,
    "aspect": null,
    "mood": null,
    "reading": "しじょう",
    "form": null,
    "pos_detail": null,
    "conj_type": null
  },
  "gloss": "market",
  "level": "A2",
  "role": null,
  "conj": [],
  "conj_id": null,
  "kanji": [
    {
      "char": "市",
      "reading": "し",
      "on": ["シ"],
      "kun": ["いち"],
      "meaning": "market, city, town",
      "strokes": 5,
      "jlpt": 3,
      "grade": 2,
      "freq": 42,
      "radical": "巾",
      "radical_name": "turban",
      "parts": ["巾", "亠"],
      "nanori": ["い", "ち"]
    },
    {
      "char": "場",
      "reading": "じょう",
      "on": ["ジョウ", "チョウ"],
      "kun": ["ば"],
      "meaning": "location, place",
      "strokes": 12,
      "jlpt": 4,
      "grade": 2,
      "freq": 52,
      "radical": "土",
      "radical_name": "earth",
      "parts": ["土", "日", "勿"],
      "nanori": []
    }
  ]
}
```

Whitespace (or the next Japanese morpheme, including particles that Sudachi split off) is on `ws` so the original orthography round-trips. Russian `ws` is typically a space or punctuation gap from razdel.

`is_word` is false for punctuation and Japanese 補助記号 / 空白.

Russian `morph.pos` uses pymorphy tags (`NOUN`, `VERB`, `ADJF`, …). Japanese POS is mapped to English labels (`noun`, `verb`, `i-adj`, `particle`, `aux`, …). Japanese `form` is Sudachi inflection (e.g. `連体形`, `仮定形`). Japanese `pos_detail` is the Sudachi POS-1 slot (`binding`, `case`, `conjunctive`, `final`, `bound`, …). `conj_type` is a simplified conjugation class (`godan`, `ichidan`, `sahen`, `kahen`, `i-adj`, `aux`). Italian and Arabic POS stay close to UD. Arabic `morph` also carries `voice`, `person`, `state`, and Form I–X on `form`; `conj_type` is the وزن pattern; `reading` is the diacritized surface.

`role` is the reader colour class, filled on every passage read: `topic` (は), `subject` (が), `object` (を), `particle`, `verb`, `aux`, `adj`, `adverb`. Nouns and pronouns stay `null` (ink).

`conj` is a Japanese verb/adjective suffix breakdown (`[{ "text": "食べ", "label": "stem" }, { "text": "まし", "label": "polite" }, { "text": "た", "label": "past" }]`). Copied onto every token in the chain. `conj_id` is the index of the head token, or `null`. Recomputed on read (like kanji), so older stored passages pick it up.

`level` is the lexicon band for the lemma, or `null` if unknown.

Japanese `kanji` parts are filled from the local KANJIDIC2 lexicon on every passage read (so older stored tokens pick up new fields). `on` is katakana; `kun` keeps KANJIDIC okurigana dots (`た.べる`). `jlpt` is the modern N-level (5 = N5). `grade` is 1–6 (kyōiku), 8 (remaining jōyō / junior high), or 9–10 (jinmeiyō). `freq` is the newspaper rank among the 2,500 most common characters. `radical` / `radical_name` are the Kangxi classifier; `parts` are KRADFILE components.

Arabic `root` is the gloss-card analog of kanji: `{ "letters": "ك ت ب", "pattern": "yaCCuC", "form": "I", "form_name": "فَعَلَ", "meaning": "write" }`. Refreshed on every passage read from `data/roots/ar.json`. Nouns keep وزن as `pattern` with `form` null. `POST /gloss` returns the same `root` object.

### Calibration

Present on every stored passage.

```json
{
  "passed": false,
  "attempts": 2,
  "overlevel_lemma_rate": 0.21,
  "subordinate_rate": 0.0,
  "forbidden_case_rate": 0.0,
  "forbidden_tense_rate": 0.0,
  "forbidden_pos_rate": 0.0,
  "flags": ["ja:te_iru (て)", "lemma:頑張る=unknown"],
  "warnings": [
    "Corrective rewrite was not closer to level; kept the first draft."
  ]
}
```

A generated draft that still fails after its rewrite is stored with `shelf_status = "quarantine"`. It is left out of the library, Continue, shelf counts, and `GET /passages/{id}` (404), except for a signed-in admin who sends `?lab=1`. The library also hides any public row whose calibration did not pass. The reader concatenates `warnings` under the article. Japanese unused rate fields (`forbidden_case_rate`, `forbidden_tense_rate`) are stored as `0`. `attempts` is 1 or 2.

## Library

```json
{
  "language": "ja",
  "placement": "A2",
  "placed": true,
  "next_id": "…",
  "seen_lemmas": 42,
  "words": [],
  "news_notice": null,
  "items": [
    {
      "id": "…",
      "language": "ja",
      "level": "A2",
      "topic": "…",
      "genre": "daily_life",
      "title": "…",
      "word_count": 86,
      "created_at": "…",
      "passed": true,
      "read": false,
      "recommended": true,
      "new_lemmas": 12,
      "recycled_lemmas": 40,
      "new_lemma_pct": 0.23,
      "series_id": null,
      "chapter_index": null,
      "has_audio": false,
      "source_name": null,
      "source_url": null,
      "source_date": null
    }
  ]
}
```

`news_notice` is today's news passage for this band, when one passed its check: `{ passage_id, title, language, level, source_name, source_date, saved, read }`. `placed` is false until the placement read (or a finished passage) sets the band.

`new_lemmas` / `recycled_lemmas` are **token occurrence counts** of content words, not unique lemmas. Sort on the backend: recommended first, then unread, then level, then newest.

`seen_lemmas` is unique lemmas stored for this device + language.

`words` is the saved-lemma list for this device + language (`[]` if anonymous): `{ lemma, gloss, passage_id, title, language }`, newest first.

## Passage stats

Subset used by the reader header, fade-known, starring, and “read next” before feedback:

`{ passage_id, language, placement, read, new_lemmas, recycled_lemmas, next_id, known_lemmas, starred_lemmas }`

`next_id` excludes the current passage. `known_lemmas` is the full seen-lemma set for fade. `starred_lemmas` is lemma strings currently on the Words list.

## Translation

`GET /passages/{id}/translation` returns the stored English string when it lines up sentence-for-sentence with the passage. Otherwise it generates, stores, and returns a new one, at most once per passage per hour. 503 if the LLM is missing or fails and nothing was stored. Requires an identity. Seeded passages have translations in `seed_translations.py`.

## Gloss

```json
{ "word": "市場", "passage_id": "optional-uuid" }
```

If `passage_id` is set, the first token on that passage whose `text` equals `word` is returned (including stored gloss, CEFR band, kanji). Otherwise the word is analyzed live and looked up in the lexicon only (no CEFR band, no LLM fill on this path).

The reader does **not** call `/gloss` today; it uses tokens already on the passage. The endpoint is for live lookup and future use.

## Feedback

```json
{ "passage_id": "…", "rating": "too_easy" }
```

`rating` is `too_easy` | `just_right` | `too_hard`. Just right ingests lemmas and marks read but does not move placement.

```json
{
  "ok": true,
  "passage_id": "…",
  "rating": "too_easy",
  "placement": "B1",
  "next_id": "…",
  "new_lemmas": 12,
  "recycled_lemmas": 40
}
```

Without a valid `X-Device-Id`, `placement` and `next_id` are null and lemma counts stay 0, but the anonymous `feedback` row is still written.

## Words

Saved lemmas from the gloss **Save** control. Writes require an identity.

`POST /words` `{ lemma, gloss?, passage_id?, language? }`. If `passage_id` is set, language is taken from that passage. Saving the same lemma again updates gloss / passage. Each saved lemma also gets an SM-2 card in `learner_cards` (see Review). `DELETE /words` `{ lemma, language }`. `GET /words?language=` returns the same list as `library.words`.

`GET /words/export.csv` and `/words/export.apkg` take `?language=` and download the saved words for that language. The web client fetches them with `X-Device-Id` so guests can export too.

## Review

`GET /review?language=` returns `{ due, cards }`: cards whose `due_at` has passed, each `{ id, lemma, gloss, reading, context, language, due_at }`. `context` is the sentence the word was saved from. `POST /review` `{ card_id, rating }` with `again`, `hard`, `good`, or `easy` reschedules the card by SM-2 and returns it.

