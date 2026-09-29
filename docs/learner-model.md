# Learner model

A browser UUID in `localStorage` (`lociros.device_id`) is sent as `X-Device-Id`. After Supabase sign-in, FastAPI copies those rows onto `public.users` (`POST /api/auth/session`) and later lookups use `user_id`. Where the account already has a row for the same key (a learner for that language, a lemma, a read passage), the account's row is kept and the browser's duplicate is dropped. The one exception is a learner row the account never placed: it takes the browser's band. Language preference is stored separately (`lociros.language`, default Japanese).

A valid device id matches `^[A-Za-z0-9_-]{8,64}$`. Anything else is ignored: the shelf still loads, but placement stays A2 and no lemmas or reads are recorded.

Per `(device_id, language)` Lociros keeps:

| Table | Role |
| ----- | ---- |
| `learners` | Current CEFR placement. `placed` is 0 until the placement read (or a finished passage) sets it. Unique on `(device_id, language)` |
| `learner_lemmas` | Content-word lemmas seen after finishing a text. Unique on `(device_id, language, lemma)` |
| `learner_taps` | Lemmas opened in the gloss. Unique on `(device_id, language, lemma)`. Not the same set as `learner_lemmas` |
| `learner_stars` | Lemmas the learner saved from a gloss. Unique on `(device_id, language, lemma)` |
| `learner_cards` | One SM-2 review card per saved lemma (ease, interval, due date). Unique on `(device_id, language, lemma)` |
| `learner_news_saves` | Daily news passages the learner saved |
| `learner_reads` | Passages already read. Unique on `(device_id, passage_id)` — language is implied by the passage |
| `news_issues` | One news passage per UTC day, language, and band, shared by every learner at that band |
| `feedback` | Raw too-easy / just-right / too-hard events (not device-scoped) |

The unique constraints are on `device_id`. Signed-in lookups go by `user_id`, which has no unique index; if two rows ever share a key, the oldest (lowest `id`) is used.

Reads and lemmas are written only in `complete_read` (the **Too easy / Just right / Too hard** path). Opening a passage does not mark it read and does not ingest lemmas. Starring a word does not ingest it into `learner_lemmas`.

## Placement

A new learner has no row yet. **Start reading** on the landing page opens a two-step onboarding dialog: pick a language, then pick a starting point. **Place me with a short read** (recommended) opens `/placement?language=`. **I know my level** or **I'm just starting** (A1) saves the band with `POST /api/placement/choose` and opens the first passage. A shelf with no band still sends the learner to one short passage and four questions (`GET`/`POST /api/placement`) before it states a band. The result opens `next_id` at the new band rather than the shelf. The score sets the band: 0–1 correct is A1, 2 is A2, 3 is B1, 4 is B2. Languages stay on separate rows.

After that, `too_easy` and `too_hard` still move the band, but only after three ratings in a row in the same direction (`PLACEMENT_STREAK`). `just_right` clears the streak and keeps the band. All three ingest lemmas, mark the passage read, and pick next.

```
A1 ⇄ A2 ⇄ B1 ⇄ B2
```

There is no half-step, and calibration `passed` is not used when bumping. A learner who already has finished passages is treated as placed, so an existing shelf is not sent back through the read.

## New vs. known

Content POS only:

- **Russian:** `NOUN`, `ADJF`, `ADJS`, `VERB`, `INFN`, `ADVB`, `PRED`, `NUMR`
- **Italian:** `NOUN`, `VERB`, `ADJ`, `ADV`, `PROPN`
- **Arabic:** `NOUN`, `VERB`, `ADJ`, `ADV`, `PROPN`
- **Japanese:** `noun`, `verb`, `i-adj`, `na-adj`, `adverb`

Counts on the shelf and reader are **token occurrences**, not unique lemmas. A recycled word that appears three times counts as three “known.” Unique lemmas are what get stored in `learner_lemmas` and what `seen_lemmas` reports on the shelf line.

Ingest happens **before** the level bump, using the seen-set from before this passage, so the `new_lemmas` / `recycled_lemmas` on the feedback response describe the text just finished.

## Next text

`pick_next_id` walks unread, non-excluded passages in this level order:

1. current placement
2. one level up (if any)
3. one level down (if any)
4. the rest of A1–B2

Within the current band, an unread passage that reuses lemmas from `learner_taps` wins, then a newer `created_at`. Other bands stay on recency. Quarantined drafts (`shelf_status = quarantine`) are never candidates, so Continue is chosen from public texts. A passage that belongs to a series offers its next chapter first. If every passage is already read, it still returns something (including an already-read row).

Restock sends those tapped lemmas to the generator as a short reuse list. The level rules in `data/grammar/` still apply.

Before the rating buttons, the reader asks two or three questions about the passage (`POST /api/comprehension`). The self-rating stays. The score is a second signal, stored as a trial event.

The recommended item is `next_id` and is highlighted as **Continue**. The reader’s stats `next_id` excludes the current passage so “Read next” is not a self-link.

## What the model is not

- Not spaced repetition for seen lemmas. `learner_lemmas` is a set, not a schedule or strength. Only saved words are scheduled: **Save** writes `learner_stars` and an SM-2 card in `learner_cards`, reviewed at `/review`.
- Not click-based for the seen-lemma set. Tapping a gloss writes `learner_taps` and can steer the next title. It does not add a lemma to `learner_lemmas`. Finishing via feedback does.
- Not cross-device until sign-in. After sign-in, guest progress on this browser is merged into the account. Clearing site data without an account is a full reset of client identity.
- Not a certificate. The placement read sets a starting band. Later movement still comes from the three-rating streak.

## Daily news

Opening the shelf schedules one passage for that learner's current language and band, for the UTC day. Japanese A2 is one checked text shared by everyone at Japanese A2. A second language gets its own. The event is a wire RSS item. The model rewrites it into the level rules and keeps the names and the date. Names, katakana, and numbers are exempt from the unknown-lemma count. If the feed cannot be fetched, the model is not configured, or the draft fails the check, that day is skipped. The shelf shows the source and the date. Restock is still how someone asks for a topic of their own.
