# Lociros

CEFR-calibrated graded readers for **Japanese**, **Italian**, **Russian**, and **Arabic**.

Lociros generates and serves short reading passages at a real A1–B2 level, then lets you tap any word for lemma, grammar, gloss, and (in Japanese) kanji or (in Arabic) the root and وزن. After each text you mark it **too easy**, **just right**, or **too hard**. That updates your placement (or leaves it), records the lemmas you just saw, and picks the next unread passage.

The product claim is not “an LLM wrote some Japanese.” It is: **grammar and vocabulary are constrained in the prompt, then checked by a morphological analyzer, then used to drive a learner model.**

---

Full product, architecture, design, API, NLP, and learner-model specs live in [`docs/`](docs/README.md).

## Contents

- [Why it exists](#why-it-exists)
- [What you can do](#what-you-can-do)
- [How a passage is made](#how-a-passage-is-made)
- [CEFR rules](#cefr-rules)
- [Learner model](#learner-model)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Data](#data)
- [API](#api)
- [Frontend](#frontend)
- [Run locally](#run-locally)
- [Deploy](#deploy)
- [Run with Docker](#run-with-docker)
- [Tests](#tests)
- [Rebuilding lexicons](#rebuilding-lexicons)
- [Environment](#environment)
- [Limitations](#limitations)
- [Documentation](#documentation)

---

## Why it exists

Asking a model to “write B1 Russian” or “write A1 Japanese” is not enough. Russian drifts into extra cases and participles. Japanese drifts into て-form, ている, relative clauses, and keigo. Italian drifts into congiuntivo, gerundio, and passato remoto. Arabic drifts into past tense, إنّ, derived verb Forms II–X, and the passive. Lociros treats CEFR as a **checkable constraint**:

1. The prompt includes per-level grammar rules and an in-band lemma sample.
2. The draft is tokenized with a real analyzer (Sudachi for Japanese, spaCy for Italian, pymorphy3 for Russian, CAMeL Tools for Arabic).
3. A validator scores over-level lemmas and forbidden constructions.
4. A failing draft is rewritten with those flags. The closer attempt is kept.
5. A draft that still fails is quarantined: stored for review, never put on the shelf.

The reading UI is built around that analysis: every word already has lemma, POS, gloss, CEFR band, grammar role, verb-suffix pieces, and kanji or Arabic root parts attached before it hits the page.

---

## What you can do

**Landing (`/`)**

- A landing page that states the claim (CEFR as a checked constraint), runs the real reader on a sample passage, and links into the library.

**Shelf (`/library`)**

- Switch between Japanese, Italian, Russian, and Arabic. All four are public by default; `SHOW_ITALIAN`, `SHOW_RUSSIAN`, or `SHOW_ARABIC` set to `false` hides one.
- Before a band is set, take a short placement read (`/placement`). After that, see your current placement and how many lemmas you have seen.
- See today's news passage for your band, rewritten from a wire RSS item (skipped that day if the feed or the level check fails).
- Open a **Continue** recommendation, or any other title on the shelf.
- Each card shows CEFR band, topic, word count, **new vs. known** content words, and whether you have already read it.
- **Restock the shelf**: generate a new passage for the current language, a CEFR level, a topic, and an optional genre (daily life, travel, news, folklore, work). Capped at `GENERATE_MONTHLY_CAP` a month per browser or account.
- Export saved words as CSV or an Anki package.

**Review (`/review`)**

- Saved words become SM-2 cards. Grade due cards as again, hard, good, or easy.

**Accounts and plans**

- A guest (a random device id in `localStorage`) can take the placement read and one passage. Signing up with Supabase Auth (email and password) moves that progress onto the account and starts a seven-day free week, no card.
- After the free week, a monthly or annual Stripe subscription keeps the shelf open (`/pricing`, Stripe Checkout, the customer portal from Settings). The paywall is on by default in production and off in development (`PAYWALL_ENABLED`).
- **Settings (`/settings`)**: name, password, plan and billing, reading preferences, JSON export of everything stored, sign out, and account deletion (cancels the subscription and removes the Supabase login).

**Reader (`/passage/[id]`)**

- Read the passage as clickable words. Tap a word for:
  - surface form, lemma, CEFR band
  - Russian: case, gender, number, tense, aspect, mood
  - Italian: tense, mood, gender, number, verb form
  - Arabic: root (جذر), verb form I–X / وزن, tense, mood, voice, person, gender, number, case, state; optional tashkeel as ruby
  - Japanese: reading (hiragana), particle/verb role, verb-suffix breakdown, kanji breakdown with on/kun, meanings, strokes, JLPT, grade, frequency, radical, parts, and a stroke-order diagram that plays as soon as the gloss opens.
  - English gloss
- Optionally colour grammar (particles, verbs, endings, adjectives). Off by default.
- Optionally furigana over kanji (Japanese) or restored vowels over Arabic, and fade already-seen content words.
- Save a lemma from the gloss; it appears on a **Words** list on the shelf and in **Review**. On Review, Japanese stroke-order diagrams appear after **Show**.
- Reveal a full **English** translation, or **this sentence** only.
- Play audio on catalog texts that have it (made offline with Azure Speech by `scripts/batch_catalog.py`).
- Answer up to three questions about the passage, then mark it **too easy**, **just right**, or **too hard**. Three too-easy or too-hard ratings in a row move placement one CEFR step; just right clears the streak. All three ingest lemmas and give you **Read next**.

**Seeded library**

On first backend start, Lociros writes a hand-authored starter library (and English translations) if they are missing or failed calibration:

| Language | A1 | A2 | B1 | B2 |
| -------- | -- | -- | -- | -- |
| Japanese | 4  | 4  | 3  | 2  |
| Russian  | 4  | 4  | 3  | 2  |
| Italian  | 2  | 2  | 1  | 0  |
| Arabic   | 2  | 2  | 1  | 0  |

A Japanese catalog of 160 more authored texts (`catalog_ja.py`) is seeded alongside. Generated texts that pass calibration are stored with these and appear on the same shelf.

---

## How a passage is made

```
topic + CEFR + genre + language
        │
        ▼
  LLM (OpenRouter)  ── grammar constraints + lemma sample
        │
        ▼
  Morphological analysis  ── tokens, lemmas, POS, readings
        │
        ▼
  Gloss attach  ── lexicon first, LLM fallback for missing lemmas
        │
        ▼
  CEFR validator  ── rates + flags
        │
        ├── pass → persist
        └── fail → rewrite with flags → keep the less-severe draft
        │
        ▼
  English translation (best-effort)
        │
        ▼
  Database (SQLite locally, Postgres in production)  →  reader
```

**Generation** (`backend/app/services/llm.py`, `generate.py`)

- Model defaults to `openai/gpt-4o-mini` via OpenRouter. Override with `LLM_MODEL`.
- Prompt includes:
  - language-specific length (Russian: 400–700 words; Italian: 350–600 words; Arabic: 280–500 words; Japanese: 22–40 short sentences)
  - `prompt_constraints` from `data/grammar/{ru,ja,it,ar}_cefr.json`
  - a random sample of ~48 lemmas at or below the target band
  - genre hint, if any
- Response must be JSON `{ "title", "text" }`.
- If calibration fails, a second call is made at lower temperature with the validator flags. Severity is `flags + weighted rates`. The less-severe attempt is stored. If it still fails it is quarantined (`shelf_status=quarantine`) and hidden from the shelf, the reader, and Continue.
- Generation runs as a background job: `POST /api/generate` returns 202 and the client polls the job.

**Analysis**

- Russian: [razdel](https://github.com/natasha/razdel) tokenizes; [pymorphy3](https://github.com/no-plagiarism/pymorphy3) lemmatizes and tags case / gender / number / tense / aspect / mood.
- Italian: [spaCy](https://spacy.io/) `it_core_news_md` tokenizes and tags lemma / POS / tense / mood / gender / number / verb form.
- Arabic: [CAMeL Tools](https://github.com/CAMeL-Lab/camel_tools) analyzes MSA. Lemmas are undiacritized. Verbs carry Form I–X / وزن; nouns carry case and state. The root (جذر) is attached the same way Japanese attaches kanji.
- Japanese: [Sudachi](https://github.com/WorksApplications/Sudachi) in split mode C. POS is mapped to English labels (`noun`, `verb`, `i-adj`, `particle`, …). Readings are converted to hiragana. Kanji in the surface form are aligned to slices of that reading.

**Glosses**

Lexicon lookup (`data/gloss/{ru,ja,it,ar}_en.json`). Unknown lemmas in generated text get a one-shot LLM batch gloss. Click-to-gloss on a live passage prefers the token already stored on that passage.

**Kanji** (`backend/app/services/kanji.py`)

For each kanji in a word, Lociros tries to consume a prefix of the word reading using on/kun candidates (including voiced, handakuten, and sokuon variants). Each part carries the matched reading, on (katakana) / kun (okurigana dots), English meanings, stroke count, JLPT N-level, school grade, newspaper frequency, Kangxi radical, and KRADFILE parts from `data/kanji/ja.json` (~13k characters, built from KANJIDIC2). Stored passages are re-aligned on read so the extra fields show up without regenerating text.

Jisho.org has no kanji API (its public endpoint is word search only). The lexicon is the same EDRDG data Jisho is built on, bundled locally. Stroke-order diagrams in the gloss use [KanjiVG](https://kanjivg.tagaini.net/) (the same source Jisho animates): opening a word fetches its SVG, then Lociros draws the strokes in Japanese order.

---

## CEFR rules

Rules live in JSON, not in prompt folklore. Validators in `backend/app/services/validator.py`, `validator_ja.py`, `validator_it.py`, and `validator_ar.py` compute rates and emit flags the LLM can be asked to fix.

### Russian (`data/grammar/ru_cefr.json`)

Checked against pymorphy tags: allowed cases and tenses, forbidden POS (participles, verbal adverbs, comparatives), forbidden conjunctions, subordinate-clause rate, over-level lemma rate. Sentence-initial *когда* is treated as “when (time)”, not a subordinate conjunction.

| Level | Grammar (simplified) |
| ----- | -------------------- |
| **A1** | Nominative + present only. No subordinates. No participles / gerunds / comparatives. |
| **A2** | Nom, acc, gen, prep, dat. Present / past / future. *когда / если / потому* allowed sparingly. No instrumental, no *который*, no *бы*. |
| **B1** | All six cases. Aspect contrast, motion verbs, reflexives, imperatives. Simple subordinates. Still no participles / gerunds / *бы*. |
| **B2** | Full case system. Participles, verbal adverbs, *бы*, *который*-clauses allowed. Vocab still capped at B2. |

A1 Russian also skips likely proper names when scoring unknown lemmas (capitalized non-initial nouns).

### Japanese (`data/grammar/ja_cefr.json`)

Constructions are detected from Sudachi tokens (particles, auxiliaries, inflection form), not from the LLM’s opinion:

| Flag | Roughly |
| ---- | ------- |
| `te_form` | て / で as a particle |
| `te_iru` | て + いる / おる |
| `plain_past` | た / だ without ます / です |
| `plain_neg` | ない without ます / です |
| `conditional` | ば / たら / なら / 仮定形 |
| `potential` / `passive` | れる / られる |
| `causative` | させる / せる |
| `relative` | 連体形 verb modifying a noun |
| `keigo` | いらっしゃる, おっしゃる, いただく, ございます, … |

| Level | Allowed (simplified) |
| ----- | -------------------- |
| **A1** | です/ます only. Core particles. No て-form, plain past/neg, ている, conditionals, potential, causative, passive, relatives, keigo. |
| **A2** | て-form, てください, plain た / ない. Still no ている, conditionals, potential, causative, passive, relatives, keigo. |
| **B1** | ている, potential, causative, simple relatives, ば/たら/なら. No passive-as-voice, no keigo. |
| **B2** | Passive and modest keigo allowed. Vocab aimed at B2 / N3–N2. |

### Italian (`data/grammar/it_cefr.json`)

Constructions are detected from spaCy tokens (aux + participle, tense, mood, verb form), not from the LLM’s opinion:

| Flag | Roughly |
| ---- | ------- |
| `passato_prossimo` | *essere/avere* + participle |
| `imperfetto` | `Tense=Imp` |
| `futuro` | `Tense=Fut` |
| `condizionale` | `Mood=Cnd` |
| `congiuntivo` | `Mood=Sub` |
| `gerundio` | `VerbForm=Ger` |
| `participio` | participle not in a compound tense |
| `passato_remoto` | finite past |
| `relative_che` | *che* after a noun |
| `clitic` / `clitic_cluster` | object clitics / *glielo*, *me lo* |

| Level | Allowed (simplified) |
| ----- | -------------------- |
| **A1** | Present indicative only. No compounds, gerunds, subjunctives, relatives, or clitics. |
| **A2** | Passato prossimo, futuro, simple clitics, *perché / quando / se*. No imperfetto, condizionale, congiuntivo. |
| **B1** | Imperfetto, condizionale, gerundio, relative *che*. No congiuntivo, no passato remoto. |
| **B2** | Congiuntivo allowed. Passato remoto still banned. Vocab capped at B2. |

### Arabic (`data/grammar/ar_cefr.json`)

Constructions are detected from CAMeL tokens (tense, mood, voice, verb Form I–X, particles), not from the LLM’s opinion:

| Flag | Roughly |
| ---- | ------- |
| `perfect` | past / perfective |
| `future` | سـ / سوف |
| `dual` | number dual |
| `inna` | إنّ / أنّ and sisters |
| `relative` | الذي / التي / … |
| `kana_compound` | كان + verb |
| `jussive` / `subjunctive` | لم / لن and أنْ |
| `passive` | voice pass |
| `form_ii` … `form_x` / `derived_form` | verb وزن beyond Form I |

| Level | Allowed (simplified) |
| ----- | -------------------- |
| **A1** | Present Form I and nominal sentences. No past, future, dual, إنّ, الذي, كان+verb, لم/لن, passive, Forms II–X. |
| **A2** | Past and future سـ/سوف, Form II/IV, لأن / إذا / عندما. |
| **B1** | إنّ, الذي, dual, jussive/subjunctive, Forms II/IV/V/VII/VIII/X. Still no passive, VI, IX. |
| **B2** | Passive and remaining forms allowed. |

A draft **passes** only if over-level lemma rate, construction hits, and (for Russian) case/tense/POS/subordinate rates all sit under the caps in the JSON. Lemma flags are truncated to 12 so the correction prompt stays readable.

---

## Learner model

A browser UUID in `localStorage` (`lociros.device_id`) is sent as `X-Device-Id`. After Supabase sign-in, FastAPI merges that guest progress onto `public.users`. Language preference is stored separately (`lociros.language`).

Per `(device_id, language)` Lociros keeps:

| Table | Role |
| ----- | ---- |
| `learners` | Current CEFR placement (default **A2**) and the rating streak |
| `learner_lemmas` | Content-word lemmas seen after finishing a text |
| `learner_taps` | Lemmas opened in the gloss (steer the next title) |
| `learner_stars` | Lemmas saved from the gloss |
| `learner_cards` | SM-2 review card per saved lemma |
| `learner_reads` | Passages already read |
| `learner_news_saves` | Saved daily news passages |
| `feedback` | Raw too-easy / just-right / too-hard events |

**Placement.** A placement read (four questions) sets the first band: 0–1 correct A1, 2 A2, 3 B1, 4 B2. After that, three `too_easy` ratings in a row move one step up (cap B2) and three `too_hard` in a row move one step down (floor A1). `just_right` keeps the band and clears the streak.

**New vs. known.** Content POS only:

- Russian: noun, adjective, verb, adverb, predicative, numeral
- Italian: noun, verb, adjective, adverb, proper noun
- Arabic: noun, verb, adjective, adverb, proper noun
- Japanese: noun, verb, i-adj, na-adj, adverb

Counts are **token occurrences**, not unique lemmas. The shelf uses this so a recycled word that appears three times counts as three “known.”

**Next text.** Prefer unread, calibration-passed passages at the current level, then one level up, then one down, then the rest of the scale. The next chapter of a series comes first. Within the current band, texts that reuse lemmas you tapped in the gloss win, then newer texts. The recommended item is highlighted as **Continue**.

---

## Architecture

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
                                                            Postgres (Compose / Supabase)
                                                            or SQLite (local)
                                                            data/*.json lexicons
                                                            local audio MP3s
                                                            OpenRouter (optional)
```

- **Frontend** talks to `/api/...` on its own origin. The route handler `src/app/api/[...path]/route.ts` proxies those paths to `NLP_BACKEND_URL` (default `http://127.0.0.1:8000`) at runtime, attaching the Supabase access token from the session cookie.
- Passage pages are **dynamic** (`force-dynamic`, `cache: "no-store"`). The server fetches `/api/passages/:id` at request time so the first paint already has tokens.
- **Backend** is a sync FastAPI app (SQLAlchemy session per request). On startup it waits for the database, creates missing tables, and seeds the library, then starts the generation worker threads.
- **Admin** is a separate Next.js app in `admin/` (`admin.lociros.com`) that reads `/api/admin/overview` server-side.

---

## Repository layout

```
levla/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS, auth middleware, lifespan → init_db + workers
│   │   ├── worker.py               # dedicated generation-worker process
│   │   ├── api/routes.py           # HTTP API
│   │   ├── core/config.py          # env (OpenRouter, DB, CORS, auth, flags, quotas)
│   │   ├── models/
│   │   │   ├── db.py               # SQLAlchemy tables, bootstrap
│   │   │   └── schemas.py          # Pydantic request/response models
│   │   └── services/
│   │       ├── generate.py         # generate, persist, quarantine, feedback, translation
│   │       ├── generation_jobs.py  # job queue + worker threads
│   │       ├── quota.py, rate_limit.py
│   │       ├── auth.py, supabase_jwt.py, identity.py, admin.py
│   │       ├── placement.py, news.py, comprehension.py, trial.py
│   │       ├── srs.py, anki_export.py, tts.py, audio_store.py
│   │       ├── catalog_ja.py       # authored Japanese catalog
│   │       ├── llm.py              # OpenRouter: passage, gloss, translate
│   │       ├── morph.py            # language dispatcher
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
│   ├── alembic/versions/           # schema migrations
│   ├── tests/
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/app/                    # landing, /library, /passage/[id], /placement, /review, /privacy, /terms, /api proxy
│   ├── src/components/             # Shelf, Reader, GenerateForm, GlossCard, landing/
│   ├── src/lib/                    # API client, types, device id, Supabase, KanjiVG parser
│   ├── next.config.ts
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
│   └── lightsail-run.sh            # run the API container on Lightsail
├── docs/
└── docker-compose.yml
```

---

## Data

| File | Size (approx.) | Purpose |
| ---- | -------------- | ------- |
| `data/vocab/ru_cefr.json` | ~5,400 lemmas | Lemma → A1–B2. Pedagogical core plus frequency banding from a 50k word list. |
| `data/vocab/ja_cefr.json` | ~4,900 lemmas | Pedagogical Japanese core plus a wider N5–N3-ish list, dictionary form. |
| `data/vocab/it_cefr.json` | ~1,000 lemmas | Pedagogical Italian core, dictionary form. |
| `data/vocab/ar_cefr.json` | ~775 lemmas | Pedagogical MSA core, undiacritized dictionary form. |
| `data/gloss/ru_en.json` | ~1,360 | Short English glosses (pedagogical overlay; not every frequency lemma has a gloss). |
| `data/gloss/ja_en.json` | ~4,900 | Short English glosses, keyed to Sudachi dictionary form. |
| `data/gloss/it_en.json` | ~1,000 | Short English glosses, keyed to lowercased lemma. |
| `data/gloss/ar_en.json` | ~775 | Short English glosses, keyed to undiacritized lemma. |
| `data/grammar/ru_cefr.json` | 4 levels | Allowed cases/tenses, forbidden POS/conjunctions, rate caps, prompt text. |
| `data/grammar/ja_cefr.json` | 4 levels | Forbidden constructions/lemmas, rate caps, prompt text. |
| `data/grammar/it_cefr.json` | 4 levels | Forbidden constructions, tenses/moods, rate caps, prompt text. |
| `data/grammar/ar_cefr.json` | 4 levels | Forbidden constructions, tenses/moods, verb forms, rate caps, prompt text. |
| `data/kanji/ja.json` | ~13,100 | Character → on, kun, meanings, strokes, JLPT, grade, freq, radical, parts. |
| `data/roots/ar.json` | ~197 | Arabic root → spaced letters + English gloss. |

Russian vocab bands are TORFL-inspired pedagogical assignments plus frequency ranks (top ~500 → A1, ~1500 A2, ~3000 B1, rest of the kept list B2). They are **not** a licensed official word list. Japanese vocab is a curated N5–N3-ish core, not JLPT official lists. Kanji JLPT tags on the gloss card come from [kanjiapi.dev](https://kanjiapi.dev/) (Jonathan Waller’s lists); readings, meanings, strokes, grade, frequency, and radicals come from [KANJIDIC2](https://www.edrdg.org/wiki/KANJIDIC_Project.html) and [KRADFILE](https://www.edrdg.org/krad/kradinf.html), used under the [EDRDG licence](https://www.edrdg.org/edrdg/licence.html). Stroke-order diagrams are [KanjiVG](https://kanjivg.tagaini.net/), © Ulrich Apel, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

`data/raw/` is gitignored. `scripts/build_lexicon.py` expects `data/raw/ru_50k.txt` if you rebuild Russian from frequency. `scripts/build_kanji.py` downloads KANJIDIC2, KRADFILE, and JLPT lists into `data/raw/` then writes `data/kanji/ja.json`.

---

## API

Base path: `/api`. OpenAPI is at `http://localhost:8000/docs` in development (turned off when `APP_ENV=production`). The full reference, including placement, news, review, exports, audio, and admin routes, is [docs/api.md](docs/api.md). The core routes:

| Method | Path | Body / query | Notes |
| ------ | ---- | ------------ | ----- |
| `GET` | `/health` | | `{ "ok": true, "name": "lociros" }` |
| `GET` | `/me` | | Identity, placement, remaining generations this month |
| `POST` | `/generate` | `{ level, topic, genre?, language }` | Needs a device id or sign-in. **200** cached passage, or **202** job id to poll. Monthly cap and 6/min rate limit |
| `GET` | `/generate/{job_id}` | header `X-Device-Id` | Job status; includes `passage` when complete |
| `GET` | `/library?language=ja\|it\|ru\|ar` | header `X-Device-Id` | Placement, seen lemma count, `next_id`, items with new/known/read/recommended. |
| `GET` | `/passages/{id}` | | Full passage: text, tokens, calibration, optional translation. Quarantined passages return 404 |
| `GET` | `/passages/{id}/translation` | header `X-Device-Id` | Returns stored English or generates and stores it (one LLM try per passage per hour). 503 if still unavailable. |
| `GET` | `/passages/{id}/stats` | header `X-Device-Id` | Placement, read flag, new/recycled counts, `next_id`, `known_lemmas`, `starred_lemmas`. |
| `POST` | `/gloss` | `{ word, passage_id? }` | Prefers the passage token; else live analyze + lexicon. |
| `POST` | `/feedback` | `{ passage_id, rating }` + `X-Device-Id` | `too_easy` \| `just_right` \| `too_hard`. Ingests lemmas, moves the level after three same-direction ratings in a row, returns next id. |
| `GET` | `/words?language=ja` | header `X-Device-Id` | Starred lemmas for the Words list. |
| `POST` | `/words` | `{ lemma, gloss?, passage_id?, language? }` + `X-Device-Id` | Save a lemma from the gloss (also creates a review card). |
| `DELETE` | `/words` | `{ lemma, language }` + `X-Device-Id` | Remove a starred lemma. |
| `GET` | `/review?language=ja` | header `X-Device-Id` | Due SM-2 cards |
| `POST` | `/review` | `{ card_id, rating }` + `X-Device-Id` | Grade a card: `again` \| `hard` \| `good` \| `easy` |

`/gloss` (120/min), `/events` (60/min), `/generate` (6/min), and `/passages/{id}/translation` (30/min) are rate limited per caller and per IP; over the limit returns 429.

**Generate request**

```json
{
  "level": "A2",
  "topic": "a quiet morning at the market",
  "genre": "daily_life",
  "language": "ja"
}
```

`level` is `A1` | `A2` | `B1` | `B2`. `language` is `ru` | `ja` | `it` | `ar` (default `ja`). `genre` is optional: `daily_life`, `travel`, `news`, `folklore`, `work`.

**Token** (what the reader clicks)

```json
{
  "text": "市場",
  "ws": "に",
  "is_word": true,
  "lemma": "市場",
  "morph": { "lemma": "市場", "pos": "noun", "reading": "しじょう", "form": null },
  "gloss": "market",
  "level": "A2",
  "kanji": [
    { "char": "市", "reading": "し", "on": ["シ"], "kun": ["いち"], "meaning": "market, city, town", "strokes": 5, "jlpt": 3, "grade": 2, "freq": 42, "radical": "巾", "radical_name": "turban", "parts": ["巾", "亠"], "nanori": ["い", "ち"] },
    { "char": "場", "reading": "じょう", "on": ["ジョウ", "チョウ"], "kun": ["ば"], "meaning": "location, place", "strokes": 12, "jlpt": 4, "grade": 2, "freq": 52, "radical": "土", "radical_name": "earth", "parts": ["土", "日", "勿"], "nanori": [] }
  ]
}
```

Whitespace between Japanese morphemes is preserved on `ws` so the original orthography (no extra spaces) round-trips.

**Calibration** on every stored passage: `passed`, `attempts` (1 or 2), rates, `flags`, `warnings`. Passages that fail both attempts are quarantined and never served to learners.

---

## Frontend

| File | Role |
| ---- | ---- |
| `src/app/page.tsx` | Landing page (`src/components/landing/`) |
| `src/app/library/page.tsx` | Shelf |
| `src/app/placement/page.tsx`, `src/app/review/page.tsx` | Placement read, SM-2 review |
| `src/app/api/[...path]/route.ts` | Proxy to FastAPI; attaches the Supabase token, blocks admin and legacy auth paths |
| `src/app/auth/callback/route.ts` | Supabase sign-in callback |
| `src/components/shelf.tsx` | Language toggle, continue card, news, rest of library, words, restock form |
| `src/components/generate-form.tsx` | Level / topic / genre → `POST /api/generate` |
| `src/app/passage/[id]/page.tsx` | Server-fetches passage, renders `Reader` |
| `src/components/reader.tsx` | Clickable tokens, gloss card, English toggle, feedback bar |
| `src/lib/api.ts` | Fetch helpers; JSON `detail` errors from FastAPI |
| `src/lib/device.ts` | Device UUID + language in `localStorage` |
| `src/lib/types.ts` | Shared TS types, CEFR/genre/language labels, morph formatting |

UI is a paper/ink/terracotta palette (`src/app/globals.css`). Display and Russian reading use Literata (Cyrillic subset). Japanese uses Outfit plus system Gothic (`Hiragino`, `Yu Gothic`, `Noto Sans JP`). Arabic uses Noto Naskh Arabic (`.font-ar`) and `dir="rtl"`.

Generation is slow on purpose (20–40 seconds is the expected wait): write, analyze, maybe rewrite, translate. The client polls the job for up to three minutes.

---

## Run locally

Needs **Python 3.12+**, **Node 20+**, and an [OpenRouter](https://openrouter.ai/) key if you want generation and live translations. The seed library and tap-to-gloss work without a key.

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# set OPENROUTER_API_KEY=sk-or-...

uvicorn app.main:app --reload --port 8000
```

SQLite file defaults to `backend/levla.db`. First boot creates tables and seeds the library (this can take a few seconds while every seed text is analyzed).

### Frontend

```bash
cd frontend
npm install
# optional: NLP_BACKEND_URL=http://127.0.0.1:8000
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If the rewrite target is wrong you will see shelf errors; the Next server must be able to reach the FastAPI process.

---

## Deploy

Production is **Vercel** (Next.js frontend and admin) + **Supabase** (Postgres and Auth) + FastAPI as a long-running Docker container on an **AWS Lightsail 4 GB** instance. Walkthrough: [docs/deploy.md](docs/deploy.md).

1. Put the Supabase session-pooler URI in backend `DATABASE_URL` (Lightsail is IPv4-only).
2. Build the backend image, load it on the Lightsail box, and start it with `scripts/lightsail-run.sh` (mounts `/opt/lociros/audio`). Set `APP_ENV=production`, `ADMIN_EMAILS`, and preferably `REQUIRE_AUTH=true`.
3. Import the repo in [Vercel](https://vercel.com/new). Set **Root Directory** to `frontend`. Set `NLP_BACKEND_URL` to that API origin and the Supabase public variables. Leave `NEXT_PUBLIC_DEMO` unset.
4. Add a second Vercel project with **Root Directory** `admin` for `admin.lociros.com`, with `ADMIN_EMAIL` set.
5. Startup does not run migrations. Run `alembic upgrade head` against Supabase when a release adds one.

The frontend can still ship as a **static demo** (hand-authored catalog, `localStorage`, no generation) if you set `NEXT_PUBLIC_DEMO=1` at build time:

```bash
cd frontend
NEXT_PUBLIC_DEMO=1 npm run dev
```

That is not the production app.

---

## Run with Docker

```bash
# backend/.env must exist (same keys as .env.example)
docker compose up --build
```

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend: [http://localhost:8000](http://localhost:8000)
- Database: Compose Postgres (`levla-pg`). Audio MP3s: named volume `levla-audio`
- The frontend container uses `NLP_BACKEND_URL=http://backend:8000` at **runtime** so `/api` and SSR stay on the Compose network
- Backend waits for Postgres, then creates tables and seeds the library on first boot

Images are production-shaped (non-root users, health checks, `APP_ENV=production` baked into the backend image). Compose overrides `APP_ENV=development` so a local `JWT_SECRET=dev-change-me` still boots. See [docs/deploy.md](docs/deploy.md) for Vercel + Supabase.

---

## Tests

From `backend/` with the venv active and `PYTHONPATH` already set by `pytest.ini`:

```bash
cd backend
pytest
```

CI (`.github/workflows/ci.yml`) runs the backend tests; the frontend lint, typecheck, build, and Playwright e2e; and the admin lint and build.

The e2e suite (`frontend/e2e/`) starts the real API on SQLite with the paywall on, and `next start` against it. It covers the guest free passage and sign-up wall, the pricing and checkout flow (Stripe mocked in the browser), the billing portal, legal pages, robots and sitemap, and the security headers:

```bash
cd frontend
npm run test:e2e          # builds first; E2E_SKIP_BUILD=1 to reuse .next
```
 The table lists the main files; see [docs/architecture.md](docs/architecture.md#tests) for the rest.

| File | Covers |
| ---- | ------ |
| `tests/test_billing.py` | Paywall off by default, guest allowance, trial start and expiry, grace on `past_due`, webhook signature, activation, cancel, idempotency, checkout without config, account deletion and export |
| `tests/test_hardening.py` | Body-size limit, event payload cap, atomic monthly quota, legacy tokens off, per-account model usage |
| `tests/test_routes_security.py` | Legacy auth off in production, single-use magic links, generate/translation need an identity, monthly cap, admin-only `lab`, stale-job reclaim, rate limits |
| `tests/test_generation_jobs.py` | Job queue, pending limit |
| `tests/test_supabase_auth.py`, `tests/test_guest_merge.py`, `tests/test_admin.py` | JWT verification, guest-to-account merge, admin gating |
| `tests/test_srs.py`, `tests/test_placement_news.py`, `tests/test_quarantine.py` | Review cards, placement scoring and daily news, quarantine |
| `tests/test_catalog.py`, `tests/test_shelf_counts.py`, `tests/test_audio_store.py`, `tests/test_trial.py`, `tests/test_config.py` | Catalog seed, shelf counts, audio paths, trial events, settings parsing |
| `tests/test_validator.py` | Russian lemmas/cases; A1 rejects past, accusative, *если*; A2 allows acc, rejects instrumental |
| `tests/test_validator_ja.py` | です/ます A1; て-form A1 vs A2; ている A2 vs B1; keigo B1 vs B2; core gloss |
| `tests/test_validator_it.py` | Present A1; passato prossimo A1 vs A2; congiuntivo B1 vs B2; core gloss |
| `tests/test_validator_ar.py` | Present A1; past A1 vs A2; Form II A1; إنّ A2 vs B1; passive B1 vs B2 |
| `tests/test_roots.py` | BW root → Arabic; Form I–X mapping; morph_from_analysis tense/case |
| `tests/test_kanji.py` | Reading alignment: 市場, 学生, 食べる, 本; dictionary fields on 本 / 語 |
| `tests/test_grammar.py` | は/が/を roles; 食べました / 食べる / て-いる / 行かない chains; Russian, Italian, and Arabic verb vs preposition |
| `tests/test_learner.py` | Placement bump, just-right no bump, new/known counts, next-id skip of already-read, star/unstar |
| `tests/test_sentences.py` | Japanese sentence index on 。; Italian and Arabic sentence index on `.`; Arabic `؟`; English split on `. ` |
| `tests/test_translation.py` | Every seed title has a non-empty English translation; persist path stores it |

Tests do **not** call OpenRouter. Gloss attach in tests uses `use_llm=False`.

---

## Rebuilding lexicons

Only needed if you change the pedagogical lists in the scripts.

```bash
# Japanese: writes data/vocab/ja_cefr.json and data/gloss/ja_en.json
python3 scripts/build_ja_lexicon.py

# Kanji: KANJIDIC2 + KRADFILE + JLPT lists → data/kanji/ja.json
python3 scripts/build_kanji.py

# Italian: writes data/vocab/it_cefr.json and data/gloss/it_en.json
python3 scripts/build_it_lexicon.py

# Arabic: writes data/vocab/ar_cefr.json, data/gloss/ar_en.json, data/roots/ar.json
python3 scripts/build_ar_lexicon.py

# Russian: needs pymorphy3 and optionally data/raw/ru_50k.txt
python3 scripts/build_lexicon.py
```

Grammar JSON is edited by hand. After changing grammar or vocab, restart the backend (loaders are `lru_cache`d). Re-seeded library rows that already passed calibration are left in place; failed ones are deleted and rewritten from `SEED`.

---

## Environment

**Backend** (`backend/.env`, see `backend/.env.example`)

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `OPENROUTER_API_KEY` | empty | Required for `/generate`, LLM gloss fill, and translation |
| `LLM_MODEL` | `openai/gpt-4o-mini` | OpenRouter model id |
| `DATABASE_URL` | SQLite at `backend/levla.db` | SQLAlchemy URL. Compose sets Postgres. `postgres://` is rewritten to `postgresql+psycopg2://`. Supabase hosts get `sslmode=require` |
| `DB_SSLMODE` | empty | Set `require` for hosted Postgres; inferred for Supabase |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated. `PUBLIC_BASE_URL` is always added |
| `CORS_ORIGIN_REGEX` | empty | Optional regex for Vercel preview origins |
| `APP_ENV` | `development` | `production` requires a real `JWT_SECRET` and sets `Secure` cookies |
| `JWT_SECRET` | `dev-change-me` | Signs the legacy FastAPI cookie used without Supabase Auth |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Public origin (OAuth, CORS, OpenRouter referer) |
| `SUPABASE_URL` | empty | `https://PROJECT.supabase.co`. Inferred from a direct `db.*.supabase.co` host |
| `SKIP_SEED` | `false` | Skip library/catalog seed on extra API/worker processes after first boot |
| `GENERATE_WORKERS` | `2` | Background threads per process that run generation jobs. Set `0` on API tasks if a dedicated worker service handles generation |
| `GENERATE_MAX_PENDING` | `3` | Max queued/running jobs per device or signed-in user |
| `SHOW_RUSSIAN` | `true` | Russian on the public shelf. Set `false` to hide it |
| `SHOW_ITALIAN` | `true` | Italian on the public shelf. Set `false` to hide it |
| `SHOW_ARABIC` | `true` | Arabic on the public shelf. Set `false` to hide it |
| `GENERATE_MONTHLY_CAP` | `10` | Custom passages per account or device per month |
| `REQUIRE_AUTH` | `true` in production, else `false` | Limits generation to signed-in accounts |
| `PAYWALL_ENABLED` | `true` in production, else `false` | Free week, then a subscription |
| `TRIAL_DAYS` / `FREE_GUEST_PASSAGES` | `7` / `1` | Free week length; passages a guest can open |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL` | empty | Billing. Without the key and monthly price, checkout returns 503 |
| `STRIPE_AUTOMATIC_TAX` | `true` | Stripe Tax on Checkout |
| `SUPABASE_SERVICE_ROLE_KEY` | empty | Lets account deletion remove the Supabase login |
| `SENTRY_DSN` | empty | Error reporting |
| `NEWS_SCHEDULER` | `true` | Builds daily news in a background thread each hour |
| `MAX_BODY_BYTES` | `262144` | Request body cap (413 above it) |
| `ADMIN_EMAILS` | empty | Comma-separated admin emails. Empty means nobody is admin |
| `AUDIO_DIR` | `backend/audio` | Where catalog MP3s live |
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | empty | Only used by `scripts/batch_catalog.py` to make audio |

The full list is in [docs/architecture.md](docs/architecture.md).

**Frontend**

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `NLP_BACKEND_URL` | `http://127.0.0.1:8000` | Backend origin for SSR passage fetch and the `/api` proxy. Read at runtime |
| `NEXT_PUBLIC_SUPABASE_URL` | empty | Supabase Auth project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | empty | Publishable key. Never the secret |
| `NEXT_PUBLIC_DEMO` | empty | Static catalog + `localStorage` learner. No Python backend. Set to `1` at **build** time only for that mode |
| `NEXT_PUBLIC_SITE_URL` | `https://lociros.com` | Canonical origin for metadata, robots, sitemap |
| `NEXT_PUBLIC_PRICE_MONTHLY` / `NEXT_PUBLIC_PRICE_ANNUAL` / `NEXT_PUBLIC_PRICE_ANNUAL_NOTE` | `$9.99` / `$79.99` / computed | Display prices on `/pricing`. Keep in step with Stripe |
| `NEXT_PUBLIC_TRIAL_DAYS` | `7` | Free week length shown in copy. Match the API's `TRIAL_DAYS` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | `hello@lociros.com` | Support address on legal pages, Settings, and errors |
| `NEXT_PUBLIC_SENTRY_DSN` | empty | Browser and server error reporting |

**Admin** (`admin/.env.local`): `ADMIN_EMAIL` (required; unset locks everyone out), `NLP_BACKEND_URL`, the two Supabase public variables, optional `ADMIN_TIME_ZONE`.

---

## Limitations

- **Quarantine, not reject.** A generated passage that still violates the ruleset after the rewrite is stored but hidden. The learner who asked for it gets no passage and the generation still counts toward the monthly cap.
- **Lexicon coverage.** Japanese vocab is about 4,900 lemmas; unknown content words count as over-level (names and some loanwords are skipped). Russian frequency lemmas without a pedagogical gloss may have no English until an LLM fill runs.
- **Analyzer errors.** pymorphy3, spaCy, Sudachi, and CAMeL Tools can pick the wrong lemma or POS; the validator will then flag or miss constructions.
- **Japanese construction detection** is heuristic (て+いる, 連体形+noun, a keigo lemma list). It will both over- and under-flag.
- **Arabic Form I–X mapping** is heuristic on CAMeL وزن patterns. A mis-tagged Form II verb can fail an A1 seed.
- **Generation cost and latency.** Two completion calls plus gloss plus translation is normal on a fail-then-rewrite path. No streaming.
- **SQLite.** Fine for a single-user or small demo. Compose uses local Postgres. Production uses Supabase.
- **Guest vs account.** A guest gets the placement read and one passage; after that an account (and, after the free week, a subscription) is needed. The guest allowance is counted per device id.
- **Languages.** `ja`, `ru`, `it`, and `ar` are all public. `SHOW_RUSSIAN`, `SHOW_ITALIAN`, and `SHOW_ARABIC` can take one off the shelf again. Adding a language means grammar JSON, vocab/gloss, a morph module, a validator, seed texts, and UI labels.

- **Audio** exists only for catalog texts that `scripts/batch_catalog.py` voiced offline. Generated passages have none.
- **Known gaps.** Unfixed security and product gaps are listed in [docs/architecture.md](docs/architecture.md#known-gaps).

Not in this repo: billed accounts, live TTS, or official CEFR/JLPT lists.

---

## Documentation

| Doc | Covers |
| --- | ------ |
| [docs/product.md](docs/product.md) | Objective, audience, reading loop, scope |
| [docs/architecture.md](docs/architecture.md) | Stack, request flow, persistence, Docker, adding a language, known gaps |
| [docs/design.md](docs/design.md) | Palette, type, layouts, components, interaction rules |
| [docs/api.md](docs/api.md) | Endpoints, headers, payloads, status codes |
| [docs/nlp-and-cefr.md](docs/nlp-and-cefr.md) | Generation, analyzers, validators, lexicons, kanji |
| [docs/learner-model.md](docs/learner-model.md) | Device id, placement, new/known counts, next-text ranking |
| [docs/deploy.md](docs/deploy.md) | Vercel frontend and admin, Supabase Postgres, FastAPI on Lightsail behind Caddy, Stripe, uptime, errors, backups |
| [docs/launch.md](docs/launch.md) | Go-live checklist for taking live payments |
