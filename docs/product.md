# Product

## Objective

Lociros is a **CEFR-calibrated graded reader** for **Japanese**, **Italian**, **Russian**, and **Arabic** (A1–B2).

It generates and serves short reading passages at a checkable CEFR band, then lets the learner tap any word for lemma, grammar, gloss, and (in Japanese) kanji or (in Arabic) the root and وزن. A short placement read sets the starting band. After each text the learner answers a few questions about the passage, then marks it **too easy**, **just right**, or **too hard**. Three ratings in a row move the band. Looked-up words come back in a later title. Once a day, one news passage from a real wire item is added at the learner's band.

The product claim is not “an LLM wrote some Japanese.” It is:

> Grammar and vocabulary are constrained in the prompt, then checked by a morphological analyzer, then used to drive a learner model.

Asking a model to “write B1 Russian” or “write A1 Japanese” is not enough. Russian drifts into extra cases and participles. Japanese drifts into て-form, ている, relative clauses, and keigo. Italian drifts into congiuntivo, gerundio, and passato remoto. Arabic drifts into past tense, إنّ, derived verb Forms II–X, and the passive. Lociros treats CEFR as a **checkable constraint**, not a prompt adjective.

## Who it is for

Serious hobbyists and heritage learners of Japanese, Italian, Russian, or Arabic who have hit the graded-reader gap: native material is too hard, textbook dialogues are too short and too fake, and LLM “write me A2 Japanese” output is not actually A2.

Reading needs no account: each browser gets a random device id and its progress is stored on the server under it. An account is optional (Supabase Auth, email and password). Signing in moves the browser's progress onto the account so it follows the reader to other browsers. There is no billing.

## What the learner can do

A landing page at `/` explains the claim and opens into the app. The main screens are the shelf, the reader, the placement read (`/placement`), and review (`/review`). `/privacy` and `/terms` hold the legal copy.

### Shelf (`/library`)

- Switch between Japanese, Italian, Russian, and Arabic. All four are public by default; `SHOW_ITALIAN`, `SHOW_RUSSIAN`, or `SHOW_ARABIC` set to `false` hides one.
- Before a band is set, read one short passage and answer four questions. After that, see the current placement and how many lemmas have been seen.
- See today's news passage, with its source and date, when one was checked for this band.
- Open a **Continue** recommendation, or any other title on the shelf.
- Each card shows CEFR band, topic, word count, **new vs. known** content-word tokens, and whether the passage has already been read.
- **Restock the shelf**: generate a new passage for the current language, a CEFR level, a topic, and an optional genre (daily life, travel, news, folklore, work). Each browser or account gets `GENERATE_MONTHLY_CAP` custom passages a month (default 10); a topic that is already on the shelf comes back from the cache and does not count. With `REQUIRE_AUTH=true` restocking also needs a signed-in account.
- Export the saved **Words** list as CSV or an Anki package.

### Reader (`/passage/[id]`)

- Read the passage as clickable words. Tap a word for:
  - surface form, lemma, CEFR band
  - Russian: case, gender, number, tense, aspect, mood
  - Italian: tense, mood, gender, number, verb form
  - Arabic: root (جذر), verb form I–X / وزن, tense, mood, voice, person, gender, number, case, state
  - Japanese: reading (hiragana), particle/verb role, verb-suffix breakdown (stem + polite/past/te-form/…), kanji breakdown with on/kun, meanings, strokes, JLPT, grade, frequency, radical, parts, and a stroke-order diagram that plays as soon as the gloss opens
  - English gloss
- Optionally **colour grammar**: particles (は topic, が subject, を object, others), verbs, endings, adjectives. Off by default; persists in `localStorage`.
- Optionally **furigana** over kanji (Japanese) or restored vowels over Arabic. Off by default.
- Optionally **fade known** content words the learner has already finished in other texts.
- Save a lemma from the gloss. It appears in the **Words** list on the shelf and becomes an SM-2 review card; due cards are graded on **Review** (`/review`) as again, hard, good, or easy. Stroke-order diagrams are not on the Words list; on Review they appear after **Show**.
- Play passage audio where it exists. Audio is made offline by `scripts/batch_catalog.py` with Azure Speech, so only catalog texts processed by that script have it; generated passages do not.
- Reveal a full **English** translation, or **this sentence** only, in the same English section under the passage. Sentence mode does not open the word gloss.
- Answer two or three questions about the passage, then mark it **too easy**, **just right**, or **too hard**. Three too-easy or too-hard ratings in a row move the band one step. Just right keeps the level. All three ingest lemmas and pick **Read next**, preferring a text that reuses words opened in the gloss.

### Seeded library

On first backend start, Lociros writes a hand-authored starter library (and English translations) if they are missing or failed calibration:

| Language | A1 | A2 | B1 | B2 |
| -------- | -- | -- | -- | -- |
| Japanese | 4  | 4  | 3  | 2  |
| Russian  | 4  | 4  | 3  | 2  |
| Italian  | 2  | 2  | 1  | 0  |
| Arabic   | 2  | 2  | 1  | 0  |

Generated texts are stored alongside these and appear on the same shelf.

## Core loop

```
Start reading  →  language, only on a cold open with several languages public
     →  placement read, if this language has no band yet (taps work; the result opens the next text)
     →  pick Continue (or any card, including today's news)
     →  read, tap words for gloss
     →  answer the passage questions
     →  Too easy / Just right / Too hard
     →  band moves after three ratings in a row, lemmas stored, Read next
     →  back on the shelf at a new recommendation
```

Optional side path: **Restock the shelf** → wait 20–40 seconds for constrained generation + validation → land on the new reader.

### Onboarding

There is no signup before reading. The account is offered under the first **Saved.** line ("This stays on this browser. Create an account to keep it."). Leaving the passage dismisses it; it comes back once, after the third finished passage, then stops. It is not shown in the demo, when Supabase Auth is not configured, or to a signed-in reader. Two one-time lines teach the app: **Tap any word.** above the placement passage (gone after the first gloss), and the three-in-a-row rule under the rating pills (gone after the first rating). All three states live in `localStorage`: `lociros.tap_hint`, `lociros.rating_hint`, `lociros.account_prompt`.

## Scope

| Area | Built |
| ---- | ----- |
| Languages | Japanese, Italian, Russian, and Arabic, A1–B2 |
| Accounts | Optional Supabase Auth (email and password). Guest device id until sign-in |
| Passage length | Russian 400–700 words; Japanese 22–40 short sentences |
| Failed calibration | Quarantined: stored for review, hidden from the shelf and the reader |
| Review | SM-2 cards for saved words, CSV and Anki export |
| Audio | Azure Speech, generated offline for catalog texts |
| Billing | Not implemented |

Not in this repo: billing, official CEFR or JLPT word lists, C1/C2, or languages other than `ru`, `ja`, `it`, and `ar`.

## Success criteria

Signals that the reading loop works:

- Testers return for a second or third passage without prompting. Measured two ways: the second-text rate in `trial_metrics` (share of readers with two or more reads, gate 40%), and the funnel's return rates, the share of browsers that come back on a later UTC day within 2 and within 7 days of their first visit.
- “Too hard” rate is low enough that CEFR labeling is credible (gate under 15%).
- Unsolicited comments name the retained hook (comprehension confidence, click-gloss, topic novelty).

### The landing funnel

Retention here means the share of landing visitors who finish and rate a first passage, then come back on another day. `trial_metrics` includes a `funnel` block, shown on the admin dashboard at `admin.lociros.com`, that follows every browser that viewed the landing page in the window:

| Step | Event | Recorded by |
|------|-------|-------------|
| Viewed the landing page | `landing_view` | browser |
| Tapped a word in the demo | `demo_tap` | browser |
| Clicked Start reading (with which button) | `start_click` | browser |
| Opened the placement read | `placement_start` | browser |
| Finished placement | `placement_done` | API |
| Rated a passage | `read_complete` | API |
| Linked an account | `account_linked` | API |

`session_start` is sent once per browser per UTC day and drives the 2-day and 7-day return rates. Events are keyed by the device id the app already sends, so there is no third-party tracker and no cookie banner. The API refuses the server-side kinds from the browser, so they cannot be inflated. Each step is judged against the landing views, not against the step before, so a change to the hero shows up in placement and return rates and not only in clicks.
