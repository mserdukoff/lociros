# Design specifications

Lociros is meant to feel like a **small printed reader on a desk**, not a language-app dashboard. Paper, ink, one accent, two paper washes, long reading measure, almost no chrome.

Implementation lives in `frontend/src/app/globals.css`, `layout.tsx`, the shared components (`band.tsx`, `segmented.tsx`, `passage-article.tsx`, `gloss-card.tsx`, `generation-progress.tsx`, `seal.tsx`), the screens (`shelf.tsx`, `reader.tsx`, `generate-form.tsx`), and the landing page (`components/landing/*`). There is no component library and no dark mode. The exam seal is the one brand object; it is not an illustration of a character.

## The engraving pass (September 2026)

The landing page follows one reference composition: warm paper, indigo ink, lifted sheets, and copperplate-style engravings in the margins, with handwritten margin notes.

- **Indigo ink.** `--ink` is the slate navy of the engravings (`#1c2538`), so type, buttons, and art read as one printing. Shadows are tinted with the same ink.
- **Sheets, not hairline boxes.** Anything the reader holds (the demo reader, proof sheets, the Continue card, the reader's passage, shelf and word lists) is a `sheet`: 14 px radius, a 7% ink border, and a soft shadow. Floating things (the demo gloss, the reader's gloss dialog, the Continue card) use `sheet-float`, which has a deeper shadow.
- **Plain paper bands.** Landing sections are all paper, divided by a full-width hairline. Section eyebrows for the check, the shelf, and rating are terracotta; the others are ink at 50%.
- **Pass is sage.** A passing seal is stamped in `--sage`; a failing one stays terracotta. This is the only place the product says "yes" in colour.
- **Art.** Engravings are generated one piece at a time (not cropped from the reference) and live in `public/art/*.webp`. Scene art has its paper colour keyed out to transparency; the three passage thumbnails stay rectangular. All of it is decoration only (`aria-hidden`, `pointer-events: none`). The cliff sits in the Rate section, and its strata labels are HTML over the image, not part of it. Handwritten notes use Caveat (`t-hand`), also decoration only, and never carry information that is not also in the body copy.
- **Each language has its own set.** Japanese, Arabic, Italian, and Russian each get a hero cliff (`cliff-{lang}`), a verb pillar (`pillar-{lang}`), a study still life (`study-{lang}`), a word stone (`stone-{lang}`: 言葉, كلمة, parola, слово), a panorama (`vista-{lang}`), and two scene thumbnails (`thumb-{lang}-{1,2}`). The card catalog, hills strip, ruins landscape, and laurel sprig are shared. Per-language copy and the positions of the hero's labels live in `landing/scenes.ts`; if a cliff is regenerated, its `face` and strata `top` percentages must be re-measured. Cliffs are not trimmed, so those percentages stay valid, and `cliff-fade` softens the canvas edges.
- **Line icons** (`LineIcon` in `landing/art.tsx`) mark the rows of the "A tap" list in the story variant. They are 1.4 px strokes in ink/60, and do not appear in the app chrome.
- **Motion and the shader wash.** `/` renders `Landing variant="shader"`. Behind the whole landing page sits a slow ShaderGradient water plane (`landing/shader-wash.tsx`, loaded client-only once the page is idle, `position: fixed`, desktop only). Its palette stays inside the site's own paper tones: `--paper` plus a deeper paper and one faint accent per language (sage wash, sand, straw, or ink-grey). Never pink, never saturated. Motion (`landing/motion-bits.tsx`) staggers the hero in (other variants only), fades the cliff in like settling ink, drifts it on scroll, floats the strata labels in, draws the hand arrows, and reveals each section on scroll; the language switch slides its ink fill (`Segmented animated`). Everything honours `prefers-reduced-motion`. The other layouts (`classic`, `motion`, `prompt`, `story`) stay previewable at `/variants/*`, which is not indexed.

## Rationale for the 2026 redesign

Three departures from the earlier spec, and why.

1. **A landing page now exists at `/`; the shelf moved to `/library`.** The old spec forbade a marketing page. The product claim (CEFR as a *checked* constraint, not a prompt adjective) is invisible from the shelf, so a visitor never learned why this is different from asking a chatbot for "A2 Japanese". The landing page is the reader: a hand-authored passage in the same column as the app, then a failed draft and the checked one. Nothing on it is a mockup. The hero uses the same `PassageArticle` and `GlossCard` as `/passage/[id]`.
2. **Hairlines replace boxes.** The shelf list, words list, reader toolbar, and gloss kanji list are rules between rows rather than bordered cards. The inverted Continue block is the one filled card. Proof sheets on the landing page are square hairline rectangles. This is the main move away from a "SaaS card grid" and toward a printed page.
3. **CEFR bands are drawn as a joined strip.** Wherever a level *matters* (placement, reader header, the demo), the four bands are shown as one hairline box with the current band inked (`BandStrip`). Where a level is only metadata (a shelf row), it is plain serif text. Inside the gloss card the band is a single hairline chip. No coloured badges.

Kept on purpose: the palette, the two typefaces, ink-on-paper inversion as the only emphasis, no icons beyond typographic arrows, no page transitions.

## Brand

| | |
| --- | --- |
| Name | **Lociros** |
| Document title | `Lociros — graded readers` (`%s · Lociros` on inner pages) |
| One-liner (metadata) | CEFR-calibrated Japanese, Italian, Russian, and Arabic passages. The level is checked by a morphological analyzer, not promised by a prompt. Tap any word for lemma, grammar, and a gloss. |
| Landing | The claim is the headline (**Graded readers where A2 is actually A2.**), with the reader beside it. |
| Library label | `{Language} · Library`, set as `t-eyebrow` |

Copy is short, second-person, and specific. No gamification ("streak", "XP"), no creature mascot, no exclamation marks in chrome. Numbers are set tabular (`tnum`). The only brand object is the **exam seal** (`seal.tsx`): one double-ring stamp for every language, terracotta ink, inscription from `SEAL_COPY`. It never appears in the gloss. Adding a language is a copy row (`script`, pass word, fail word), not a new drawing. Missing languages fall back to PASS / FAIL.

## Color

CSS custom properties on `:root`, registered as Tailwind theme colors (`bg-paper`, `text-ink`, `border-rule`, `text-terracotta`, …).

| Token | Hex | Role |
| ----- | --- | ---- |
| `--paper` | `#f4efe6` | Page background; also the colour keyed out of the engravings |
| `--paper-raised` | `#fbf9f4` | Sheets, gloss panel, segmented controls |
| `--paper-deep` | `#ebe5d8` | Hover wash inside segmented controls. A tonal step of paper, not a second accent |
| `--blush` / `--blush-deep` | `#f2e5da` / `#e6c8b6` | Reserved tints; not used as bands |
| `--sage-wash` | `#ebe9dc` | The review-due row on the shelf |
| `--sage` | `#4f6e57` | Passing exam seals, the "Too hard" mark in the landing rating demo |
| `--ink` | `#1c2538` | Text, primary button, active band. Indigo slate, matched to the engravings |
| `--rule` | `#dcd5c7` | Every hairline, skeleton bars |
| `--terracotta` | `#b5452a` | Section eyebrows on the landing, selected genre chip, errors, selected word wash, drift flags, failing seals |

Shadows are two tokens, `--elev-card` and `--elev-float` (Tailwind `shadow-card`, `shadow-float`), both tinted with the ink at low alpha.

Grammar-colour inks (`--g-*`) are unchanged and remain an opt-in overlay.

Derived states use opacity modifiers, not extra tokens: `text-ink/70 /55 /50 /45 /40`, `hover:bg-paper-raised`, `bg-terracotta/16` (selected word), `border-terracotta/30 bg-terracotta/10` (error panel).

Terracotta on the landing page is the underlines and flags on the drifted draft, its summary line, and the exam seals on both proof sheets. The checked draft’s type is ink only; the pass seal is the terracotta on that sheet. Section labels are ink at 50%, not terracotta.

## Typography

Google fonts via `next/font` in `layout.tsx`.

| Role | Face | Notes |
| ---- | ---- | ----- |
| UI / Japanese | **Outfit** (`--font-outfit`) | Latin only; Japanese glyphs come from the system Gothic stack (`.font-ja`) |
| Arabic | **Noto Naskh Arabic** (`--font-naskh`) | `.font-ar`; passages, titles, and the seal use `dir="rtl"` |
| Serif | **Literata** (`--font-literata`) | Variable, `latin` + `cyrillic`, with the **`opsz` axis enabled**. `font-optical-sizing: auto` lets one file set 11 px band labels and 64 px display |
| Morph line | `font-mono` | Grammar tags in the gloss card |

Type roles are `@utility` classes in `globals.css`, so the scale lives in one place:

| Class | Use | Setting |
| ----- | --- | ------- |
| `t-display` | Occasional display line | Literata 450, tracking −0.024em, leading 1.02, balanced |
| `t-heading` | Section h2, library placement line | Literata 450, tracking −0.016em, leading 1.14 |
| `t-eyebrow` | Section labels, field legends, topic line, library label | 11 px, caps, tracking 0.18em, ink/50 |
| `t-quiet` | Text actions (← Library, Restock, toggles) | 13 px, ink/50 → ink on hover |

Sizes in use: landing passage title `2.1 / 2.6rem` (same as the reader); landing section h2 `1.5 / 1.75rem`; library placement `2 / 2.5rem`; reader title `2.1 / 2.6rem`; reader body `1.35 / 1.45rem` at leading 1.85 (2.35 with furigana); gloss surface `1.75rem`; landing lede `1.0625rem`.

## Layout

Single column everywhere.

| Surface | Max width | Padding |
| ------- | --------- | ------- |
| Landing, privacy, terms | `max-w-[42rem]` | `px-5 sm:px-8` |
| Library | `max-w-[36rem]` | `px-5 pt-8 pb-24` / `sm:px-8 sm:pt-10` |
| Reader | `max-w-[42rem]` | `px-5 pt-7 pb-32` / `sm:px-8 sm:pt-9` |
| Review | `max-w-[36rem]` | as library |
| 404 | `max-w-md` | `px-5 py-24` |

The landing correction sits under a full-width hairline. There are no folio numbers and no multi-column section heads.

## Spacing and radii

Vertical stacks on the app screens use gaps of **3 / 9 / 12** (12 / 36 / 48 px). Form fields are `gap-9`. Row lists are hairline-divided with `py-3.5`.

| Element | Radius |
| ------- | ------ |
| Cards, segmented controls, buttons, gloss panel | `rounded-card` (6 px) |
| Band strip | 4 px |
| Genre chips, feedback pills | `rounded-full` |
| Clickable word | 3 px |
| Kanji stroke diagram | none (hairline square) |
| Inputs | none: `field-line` is a bottom rule only |

## Controls

- **Segmented** (`segmented.tsx`): one hairline box divided into cells; the active cell inverts to ink. Used for language (shelf header, demo) and CEFR level (restock form).
- **BandStrip / BandChip** (`band.tsx`): see rationale above.
- **Primary button** (`btn-primary`): 48 px, ink fill, paper text, 6 px radius. One per screen at most.
- **Toggles** (reader, demo): underlined 13 px text; pressed = ink text with a stronger underline. `aria-pressed` is set.
- **Focus**: a global `:focus-visible` outline, 1.5 px ink, 3 px offset.

## Iconography and motion

No icons. Typographic arrows only (`←`, `→`, `↓`). Transitions are colour and border, 150 ms. `prefers-reduced-motion` collapses them. No page transitions, no skeleton shimmer.

Three animated elements, all paced rather than decorative:

1. The **generation progress hairline** (`generation-progress.tsx`): a 1 px rule that fills asymptotically (never past 94 %) while five stages (Writing at A2 → Analyzing every word → Scoring → Rewriting if it missed → Stamping {level}) move from ink/30 to ink on a timer, with an elapsed-seconds count. It is a paced account of what the backend does, not a measured one, and the copy says "Usually 20–40 seconds". When the job returns, the hairline completes, the fifth stage is the active one, and the exam seal presses before navigation.
2. **Kanji stroke order** (`stroke-order.tsx`): when a Japanese word opens in the gloss, each kanji shows a KanjiVG diagram immediately. Faint traces of the character sit under ink strokes that draw in sequence, with numbers appearing as each stroke starts. Click the diagram to replay. `prefers-reduced-motion` shows the completed numbered diagram with no drawing.
3. The **exam seal** (`seal.tsx`): one press, scale 1.16 → 1 with a few degrees of rotation, 280 ms. `prefers-reduced-motion` shows the seal already down. On inverted surfaces (Continue) the seal uses paper instead of terracotta.

The gloss panel is a `sheet-float` on `sm+` and a top rule on small screens.

## Screens

### Landing (`/`)

The first screen is the product: the claim on the left and the real reader on the right. Four sections follow, in the order a skeptical visitor needs them: proof, what happens next, and one last way in.

1. Nav: wordmark, **The check**, **The shelf**, **Sign in** (full app only), and an ink **Start reading** button (**Your shelf** when signed in or placed on this browser). Every Start reading on the page saves the current language and opens `/library`, which routes an unplaced reader to the placement read. **Sign in** scrolls to the account sheet, which opens in sign-in mode.
2. Hero: eyebrow **Every word has depth.**, headline **Graded readers where A2 is actually A2.**, a one-line lede (A1 to B2, checked by a morphological analyzer, tap any word), the language control (only the public languages from `/api/me`; a plain line when there is one), **Start reading** and **How the check works ↓**. On the right, the **reader demo** (`reader-demo.tsx`): band strip, title, toggles, tappable passage, one word already open, and its gloss overlapping the sheet's lower edge in the flow. On phones it stacks directly under Start reading. The hero has no art, so nothing competes with the headline for the first paint.
   - **Returning reader.** With a band on this browser or an account, the right column is instead **Continue** and the same `ContinueCard` as the library (`continue-card.tsx`), with **Your {Language} is at {band}. Open the shelf**. The card's **Read →** is then the screen's one primary button, so the hero's Start reading is hidden. `/` never redirects; shared links and the logo still need the page.
3. **The check**: heading and procedure on the left, two proof sheets on the right (`drift.tsx`), fail seal then pass seal pressed into their corners, captions underneath. Under the copy, one live line from `/api/shelf/counts`: **{n} {Language} passages on the shelf, each checked by {analyzer}.** (Sudachi, pymorphy3, spaCy, or CAMeL Tools). It is the page's only proof and it is real data; there are no testimonials.
4. **Rate and move forward** (`#rate`), which also holds the shelf (`#shelf`, `#account`). Copy on levels, the three ratings, recycled lemmas, and **Once a day, one news passage from a real wire story is added at your level, checked like the rest.** beside the language's cliff, whose HTML labels name the layers A1 Everyday words, A2 Daily life, B1 Stories, B2 Culture and history (from `sm`). Below: the rating demo (three fanned cards and the three marks, with a one-line result) and **Keep your shelf.** with the sign-in sheet (signed out, full app) or a card that opens the library (demo or signed in).
5. Closing row: **A calmer, more certain way to read.**, the public languages, **Start reading**, **Explore the library →**, with the language's panorama (`vista-fade`) and its handwritten place caption. Then the footer.

"A tap" and "Explore" are no longer sections; the hero shows the tap and the panorama closes the page. The story variant still has its tap step. The whole page follows one language choice, which is saved so the library, placement read, and reader open in it. Copy does not use em dashes.

**Speed.** Targets on a mid-range phone are LCP under 2.5 s and CLS under 0.1, watched with Vercel Speed Insights. On `/` the hero renders without the staggered entrance, because that server-renders the headline at opacity 0 until hydration. The shader wash loads only after the page is idle, and never below `lg`, with `prefers-reduced-motion`, or with Save-Data; the paper colour stands in for it. Art is lazy and offers 320, 640, and full-size files through `srcset` (`Art`, `InkArt`); run `node scripts/art-sizes.mjs` in `frontend/` after adding or replacing art.

**Sticky Start reading test.** `NEXT_PUBLIC_STICKY_START_TEST=1` turns on an A/B test of a Start reading bar pinned to the bottom of phone screens (`sticky-start.tsx`). Browsers split by device id, the bar appears only while no other Start reading is on screen, and the arm is recorded on `landing_view`. Admin compares how many of each arm finish placement; keep the bar only if that rate is higher.

### Privacy (`/privacy`) and terms (`/terms`)

Same column as the landing page. Privacy states what stays in the browser (device id, language, reader preferences, and in the demo the ratings and saved words) and that a signed-in library is stored on the server. Terms states that the passages are for study, that the demo has no accounts, and that the level check can be wrong.

### Library (`/library`)

1. Header: wordmark (links to `/`), language segmented control (hidden when only Japanese is enabled).
2. The language's panorama as a faded banner, then eyebrow `{Language} · Library`, heading **Your {Language} is at {band}.**, band strip, status line (`{n} lemmas seen.` / `Rate a passage to move it.` + `Three ratings in a row move the band.`).
3. Auth panel (full app): a hairline row. Signed out, it reads **This shelf is on this browser.** with **Sign in or create an account**, which opens the email form in place. A shelf with no band for this language is never shown; the page replaces itself with `/placement`.
4. Error panel.
5. **Continue**: a `sheet-float`. Band strip and a mark-size exam seal top-left, an engraved thumbnail top-right (one of the passage language's two, chosen from the passage id), topic, title, then a ruled meta line with an ink **Read →** button.
6. Review row on a sage sheet (only when cards are due).
7. **The shelf**: rows on one sheet. Title, band + chapter right-aligned in serif, then `{topic} · {n} words · {n}% new · audio · read`. Hover washes the row to paper-raised. A mark-size fail seal sits on rows that failed calibration; passed rows stay unmarked.
8. **Words**: hairline rows with Remove; lemma, gloss, source title; export links. Stroke-order diagrams stay off this list — they belong on review.
9. **Restock**: a section label and **Restock the shelf →**; open state shows one sentence and the form, with **Hide restock** below. **Review saved words** sits beside it when nothing is due.

### Restock form

Language and level are segmented controls (level cells: serif band + hint). Topic is a `field-line` input. Genre stays as terracotta-selected pills. Submit is `btn-primary`, full width, then the generation progress block under a hairline while busy. Quota line under the button when known. When the job returns, the fifth stage (“Stamping {level}”) activates, the exam seal presses with the real `calibration.passed` verdict, and navigation waits ~900 ms (or a **Read →** click). `prefers-reduced-motion` skips the wait.

### Reader (`/passage/[id]`)

From `lg`, a fixed left rail (`reader-rail.tsx`): wordmark, **Library**, **Review**, **Vocabulary** (the library's words list), then the passage language's ink-wash branch (pine, date palm, olive, birch) and a small terracotta stamp (学ぶ set vertically, تعلّم, imparare, учиться). The rail has no Stats or Settings links because those pages do not exist.

Behind the title block, the language's ink-wash landscape (`wash-{lang}`: Fuji, desert city, Tuscan hill town, river church) fades out on every side (`wash-fade`); for Arabic it is mirrored to the left with the seal. The header and the sheet are positioned so they paint over it.

Header: **← Library** left; tracked meta (`{n} words · {n} new · {n} known`, `sm+`) and a band strip right.

Topic line as eyebrow (`{topic} · chapter n · {n}% new`), then the title at up to 3.1rem with a short ink rule under it, with a corner exam seal on the title block. The seal’s verdict is `calibration.passed` (pass inscription or fail), even if the passage is still readable. Audio bar if present.

The passage sits on one sheet. Its top row is tabs in serif: **English · Sentence · Grammar · Furigana (ja) / Vowels (ar) · Known**, then a short divider and **Why this is {band}**. Each tab is an independent toggle; every one that is on gets a 2 px ink underline on the row's hairline. On small screens the row scrolls sideways instead of wrapping. When Grammar is on, a second hairline row holds the colour legend (は TOPIC, が SUBJECT, を OBJECT, PARTICLE, VERB, ENDING, ADJECTIVE for Japanese); the calibration report opens in the same row, with a smaller seal. The passage type is 1.45rem, 1.7rem from `sm`.

Article rules are unchanged (word buttons, hover, selection, chain highlight, fade known, furigana). Calibration warnings print with a terracotta left rule.

Rating is in the page flow, not a sticky bar: comprehension questions (with **Check answers**), then **Was this {band} passage…** with the three pills, then the saved line and, when it differs from the pager's next, **Read the suggested next →**. Until the reader has rated once, a line under the pills says **Too easy and too hard move the band after three in a row. Just right keeps it.** When the account offer is due, it sits under the saved line as plain text with an underlined action; the form opens in place (**Keep this shelf**, email, password with Show, **Create account**, **Not now**), and success replaces it with one line naming whose band now applies. The page ends with the pager: an outlined **← Previous**, `{i} / {n}` over up to ten dots, and an ink **Next →**, in shelf order for the passage's language. Past the last shelf item, Next falls back to the recommended passage.

The **English** block sits under the passage with an eyebrow. Full translation and **Sentence** share that block: Sentence turns off the gloss and fills the same English section with the tapped sentence. In Sentence mode the article selects whole sentences (hover and click), not individual words.

The gloss floats at `min(38rem, 100% − 2rem)` on `sm+`, up to `75vh`, centred on the reading column (offset by half the rail from `lg`). Unselected feedback pills dim after a rating.

### Review, 404, loading

Review follows the library header pattern (`← Library`, due count as tracked meta), with the card catalog beside the heading from `sm`. Japanese cards show stroke-order diagrams only after **Show**, together with the gloss and ratings. 404 shows the ruins landscape and links **Back to the library**. The placement read (`/placement`) has the wordmark on the left and **Change language** on the right (the language name when only one is public). With no saved language and several public, it first asks **Which language will you read?** as a list of names, then **Read a short passage**. The passage is set at reader size, its words open the real gloss, and **Tap any word.** sits above the title until the first tap. The questions end in **Continue**. The result is **Your {Language} starts at {band}.**, the band strip, **Three ratings in a row move it.**, and **Read the next one**; the score is not shown. It shows the chosen language's cliff above its heading from `sm`; privacy and terms carry the hills strip. The reader loading state is a static composition: header with `← Library` and an empty band-strip outline, a title bar, a toolbar of three stubs, and five text lines.

## Gloss card content order

Unchanged: surface (with reading beside it) → lemma + band chip → morph line → suffix chain → gloss → Save → kanji rows (hairline-divided). Each kanji row opens with its stroke-order diagram already playing; tap the diagram to replay.

## Interaction rules

Unchanged from the previous spec (`lociros.language`, `lociros.grammar`, `lociros.furigana`, `lociros.fade`, `lociros.device_id`; abort on language change; one-shot feedback; lazy English). The demo on the landing page keeps its own local state and never calls the API. Post-sign-in redirects land on `/library`. The service worker precaches `/`, `/library`, `/review`; the PWA `start_url` is `/library`.

## Accessibility

- Gloss panel: `role="dialog"`, close button labelled. Demo gloss area: `role="region"`, `aria-live="polite"`.
- Word buttons and toggles set `aria-pressed`. Segmented controls are `radiogroup` / `radio`. Kanji stroke diagrams in the gloss, and on review after **Show**, are buttons labelled to replay stroke order. Exam seals are `role="img"` with the inscription and band as the label.
- Global `:focus-visible` ring.
- Band strips carry an `aria-label` (`A2 on a scale of A1 to B2`).
- `text-ink/40` remains the weakest tone and should not carry essential meaning alone.

## What not to add

- Dark mode, gradient stripes, hard or cool-grey shadows, coloured CEFR badges, progress rings, creature mascots, testimonials, pricing.
- A second accent. Caveat is for margin notes only, never for UI text.
- A second seal geometry per language, a face or speech bubble on the seal, or the seal inside the gloss card.
- A picture of the reader instead of the reader. The demo sheet and proof sheets are real components; the engravings stay in the margins.
