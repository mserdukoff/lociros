# NLP and CEFR calibration

Lociros’s differentiator is that CEFR is a **ruleset plus an analyzer**, not a prompt slogan.

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

## Generation (`llm.py`, `generate.py`)

- Model: `LLM_MODEL` (default `openai/gpt-4o-mini`) via OpenRouter (`https://openrouter.ai/api/v1`).
- First draft temperature **0.7**, 45s timeout. Correction pass **0.4**.
- Prompt includes:
  - language-specific length: Russian **400–700 words**; Italian **350–600 words**; Arabic **280–500 words**; Japanese **22–40 short sentences**
  - `prompt_constraints` from `data/grammar/{ru,ja,it,ar}_cefr.json` for that level
  - a deterministic-ish random sample of **~48 lemmas** at or below the target band (`random.Random(language + level + str(len(pool)))`)
  - genre hint, if the genre is one of `daily_life`, `travel`, `news`, `folklore`, `work`
  - script notes: Russian must mark ё and avoid Latin; Italian must mark accents (è, perché, città); Arabic must be unvowelled MSA with hamza; Japanese must not insert spaces or furigana
- Response must be JSON `{ "title", "text" }`. Markdown fences and a greedy `{…}` extract are tolerated. Empty text raises. Empty title falls back to the topic.

If calibration fails, a second call is made with up to 20 validator flags. **Severity** is `flags + weighted rates` (see below). The less-severe attempt is stored. A draft that still fails is **quarantined** (`shelf_status=quarantine`) and is not returned by the public library, next-text picker, or `/api/passages/{id}` unless a signed-in admin sends `?lab=1`.

Warnings that can land on the passage:

- Corrective rewrite was not closer to level; kept the first draft.
- Corrective rewrite failed; returning the first draft.
- Library text still has out-of-level flags. (seed path only; those rows are quarantined unless they pass)

Authored seed texts skip the LLM and skip LLM gloss fill (`use_llm_gloss=False`). They still run morph + lexicon + validator. Failed seed rows are deleted and rewritten on the next boot; passed rows are left in place (translation backfilled if missing). A Japanese starter catalog of 160 authored texts (50 A1, 57 A2, 33 B1, 20 B2, including 10 series chapters) is seeded from `catalog_ja.py`.

### Genre hints (prompt only)

| id | Hint |
| -- | ---- |
| `daily_life` | everyday life, a small scene at home or in the city |
| `travel` | travel, a trip, a station or a new city |
| `news` | a short news-style report, still narrative, not a headline dump |
| `folklore` | a folk-tale or fable tone, simple characters |
| `work` | work, a workplace, colleagues, a task |

## Morphological analysis

Dispatcher: `morph.py` → `analyze_text` / `analyze_word`.

### Russian

- **razdel** splits the string; trailing whitespace between razdel tokens is stored on `ws`.
- A token is a word iff it contains Cyrillic (`[А-Яа-яЁё]`).
- **pymorphy3** supplies lemma (lowercased) and tags. Mapped to:

| pymorphy | Lociros |
| -------- | ----- |
| case `nomn/gent/datv/accs/ablt/loct/voct` (+ gen2, acc2, loc2) | `nom / gen / dat / acc / ins / prep` (vocative → nom) |
| tense `pres/past/futr` | `pres / past / fut` |
| gender `masc/femn/neut` | `masc / fem / neut` |
| number `sing/plur` | `sg / pl` |
| aspect `impf/perf` | `impf / perf` |
| mood `indc/impr` | `indc / impr` |

POS is left as pymorphy (`NOUN`, `VERB`, `INFN`, `ADJF`, `PRTF`, `GRND`, …). CEFR band is `vocab_bands["ru"].get(lemma)`.

### Italian

- **spaCy** `it_core_news_md` splits the string; trailing whitespace between tokens is stored on `ws`.
- A token is a word iff it contains a Latin letter.
- UD morph features map onto `MorphInfo`:

| spaCy UD | Lociros |
| -------- | ----- |
| tense `Pres/Past/Fut/Imp` | `pres / past / fut / impf` |
| mood `Ind/Imp/Sub/Cnd` | `indc / impr / subj / cond` |
| VerbForm `Fin/Inf/Part/Ger` | `fin / inf / part / ger` |
| gender `Masc/Fem` | `masc / fem` |
| number `Sing/Plur` | `sg / pl` |

POS is left as UD (`NOUN`, `VERB`, `ADJ`, `AUX`, `ADP`, …). Proper nouns set `pos_detail` to `proper-noun`. Lemma keys are lowercased. CEFR band is `vocab_bands["it"].get(lemma)`.

### Arabic

- **CAMeL Tools** MSA analyzer (`MorphologyDB` + optional `MLEDisambiguator`). Tokenization is custom and whitespace-preserving; punctuation including `؟` is a non-word.
- A token is a word iff it contains an Arabic letter. Lemmas are undiacritized and alef-normalized (`أإآٱ` → `ا`, `ى` → `ي`).
- CAMeL features map onto `MorphInfo`:

| CAMeL | Lociros |
| ----- | ----- |
| asp `p/i/c` | tense `past / pres`; aspect `perf / impf`; mood `impr` when asp is `c` |
| mod `i/s/j` | mood `indc / subj / juss` |
| vox `a/p` | voice `act / pass` |
| cas `n/a/g` | case `nom / acc / gen` |
| stt `d/i/c` | state `def / indef / const` |
| per / gen / num | person `1/2/3`, gender `masc/fem`, number `sg/du/pl` |
| pattern | `conj_type`; verbs also get Form I–X on `form` |
| diac | `reading` (tashkeel), shown as ruby when Vowels is on |
| root | `Token.root` via `roots.py` |

POS is mapped toward UD (`NOUN`, `VERB`, `ADJ`, `ADP`, `PART`, …). Proper nouns set `pos_detail` to `proper-noun`. If the CAMeL database is missing, tokens still split but features and roots stay empty.

### Japanese

- **Sudachi** dictionary, **split mode C** (coarse; fewer morpheme cuts than A/B).
- POS 0 mapped through `POS_EN` (`名詞→noun`, `動詞→verb`, `形容詞→i-adj`, `形状詞→na-adj`, `助詞→particle`, `助動詞→aux`, …). Unknown POS 0 is kept as the Japanese label.
- POS 1 mapped through `POS1_EN` onto `pos_detail` (`係助詞→binding`, `格助詞→case`, `接続助詞→conjunctive`, `終助詞→final`, `非自立可能→bound`, …).
- `form` is POS slot 5 (inflection), e.g. `連体形`, `仮定形`.
- `conj_type` is POS slot 4 simplified: `godan`, `ichidan`, `sahen`, `kahen`, `i-adj`, `aux`.
- Reading: Sudachi `reading_form()` converted katakana→hiragana. Dropped when the surface is already kana-only and the reading equals the surface or lemma. A small spoken-form map overrides UniDic’s formal dictionary reading for 私 (`わたくし` → `わたし`).
- Punctuation (`補助記号`) and whitespace (`空白`) are non-words.
- Kanji breakdown runs at tokenize time, and again on every passage read so stored tokens pick up lexicon updates.

### Kanji (`kanji.py`)

`data/kanji/ja.json` (~13k characters): on, kun, meanings, strokes, JLPT N-level, school grade, newspaper frequency, Kangxi radical, KRADFILE parts. Built by `scripts/build_kanji.py` from KANJIDIC2 (the same EDRDG data Jisho uses). Jisho’s public API is word search only and has no kanji endpoint.

For each kanji in the surface, Lociros tries to consume a **prefix of the remaining word reading** using on/kun candidates, including:

- dakuten (か→が)
- handakuten (は→ぱ)
- sokuon (く/き/ち/つ → っ)

Candidates are tried longest-first. Okurigana kana in the surface also advance the remaining reading. Each part carries the matched slice (or `null`), on in katakana, kun with okurigana dots, all English meanings lowercased, plus strokes / JLPT / grade / freq / radical / parts. Breakdown runs again when a stored passage is read, so older tokens pick up new fields.

This is heuristic alignment, not a morphological gold standard. Tests lock 市場, 学生, 食べる, 本.

Stroke-order diagrams are not in the lexicon. The gloss card fetches [KanjiVG](https://kanjivg.tagaini.net/) SVGs (Japanese stroke order, the same source Jisho uses) via `GET /kanji-strokes/{code}` and animates the paths in the browser. `code` is the character’s 5-digit hex codepoint (`食` → `098df`). Characters KanjiVG does not cover stay as a static glyph.

### Roots (`roots.py`)

`data/roots/ar.json` (~197 roots): spaced letters plus a short English gloss. Built by `scripts/build_ar_lexicon.py`.

Each content token can carry one `RootPart` (`letters` like `ك ت ب`, `pattern` / وزن, Form I–X for verbs, `form_name` like فَعَّلَ, `meaning`). Mapping CAMeL Buckwalter patterns onto Forms I–X is heuristic. `attach_roots` runs again when a stored passage is read, so older tokens pick up lexicon meanings.

This is the gloss-card analog of kanji: one root per word, not a list of characters.

## Grammar roles and verb suffixes (`grammar.py`)

After morph (and again on every passage read), `attach_grammar` fills `role`, `conj`, and `conj_id`.

**Colour roles.** Japanese: は → `topic`, が → `subject`, を → `object`, other 助詞 → `particle`, 動詞 → `verb`, 助動詞 and non-head chain members → `aux`, i/na-adjectives → `adj`, adverbs → `adverb`. Nouns and pronouns stay uncoloured. Russian: `VERB`/`INFN`/`PRTF`/`GRND` → `verb`, adjectives → `adj`, `PREP`/`CONJ`/`PRCL` → `particle`, `ADVB` → `adverb`. Italian and Arabic use the same Latin map: `VERB` → `verb`, `ADJ` → `adj`, `ADP`/`PART`/`DET`/`SCONJ`/`CCONJ` → `particle`, `ADV` → `adverb`.

**Japanese conjugation chains.** A chain starts at a verb, i-adj, na-adj, or aux (copula です after a noun). It continues through auxiliaries (ます, た, ない, れる, させる, …), conjunctive particles (て, で, ば, ながら), and subsidiary verbs after て (いる, しまう, みる, おく, …). Dictionary-form heads split the last kana (`食べる` → 食べ stem + る dictionary; `高い` → 高 + い). Labels include polite, past, te-form, negative, progressive, causative, passive / potential, conditional, volitional, copula, adnominal.

Tapping any piece of the chain in the reader shows the same breakdown. Tests lock は/が/を, 食べました, 食べる, 読んでいます, 行かない.

## Glosses

1. Lexicon `data/gloss/{ru,ja,it,ar}_en.json` keyed by lemma (Russian and Italian lookup is case-insensitive; Arabic lookup uses the same undiacritized alef-normalized key as the morph module).
2. Remaining lemmas: one-shot LLM batch (`gloss_lemmas`), temperature 0, JSON object lemma→1–5 word English gloss. Russian and Italian keys lowercased. Failure → empty dict; those tokens stay unglossed.
3. Live `POST /gloss` without a matching passage token does **not** call the LLM; lexicon only.

## Validators

Rules live in JSON. Python only scores. Lemma flags are truncated to **12** so the correction prompt stays readable.

### Severity (to pick the closer draft)

```
len(flags)
+ overlevel_lemma_rate * 10
+ forbidden_case_rate * 20
+ forbidden_tense_rate * 20
+ forbidden_pos_rate * 30
+ subordinate_rate * 8
```

Lower is better.

### Russian (`validator.py` + `data/grammar/ru_cefr.json`)

Checked against pymorphy tags: allowed cases and tenses, forbidden POS (participles, verbal adverbs, comparatives), forbidden conjunctions, subordinate-clause rate, over-level lemma rate.

Sentence-initial **когда** is treated as “when (time)”, not a subordinate conjunction.

A1 also skips likely proper names when scoring unknown lemmas (capitalized non-initial nouns).

A draft **passes** only if all of these hold:

- case / tense / POS / subordinate rates ≤ caps in JSON
- over-level content-lemma rate ≤ cap
- **zero** forbidden-conjunction hits (`conj_hits == 0`)

| Level | Grammar (simplified) |
| ----- | -------------------- |
| **A1** | Nominative + present only. No subordinates. No participles / gerunds / comparatives. Caps: over-level 0.15, forbidden case 0.12, tense 0.12, POS 0.02, subordinate 0. |
| **A2** | Nom, acc, gen, prep, dat. Present / past / future. *когда / если / потому* allowed sparingly (subordinate cap 0.08). No instrumental, no *который*, no *бы*. |
| **B1** | All six cases. Aspect contrast, motion verbs, reflexives, imperatives. Simple subordinates (cap 0.28). Still no participles / gerunds / *бы* / *который*. Forbidden case/tense caps 0. |
| **B2** | Full case system. Participles, verbal adverbs, *бы*, *который*-clauses allowed. Vocab still capped (over-level 0.30). POS cap 1.0 (effectively off). |

Content POS for over-level and learner counts: `NOUN, ADJF, ADJS, VERB, INFN, ADVB, PRED, NUMR`.

### Japanese (`validator_ja.py` + `data/grammar/ja_cefr.json`)

Constructions are detected from Sudachi tokens (particles, auxiliaries, inflection form), not from the LLM’s opinion.

| Flag | Detection |
| ---- | --------- |
| `te_form` | surface て / で and POS particle |
| `te_iru` | that て/で followed by lemma いる / おる |
| `plain_past` | lemma た / だ as aux, not after ます / です |
| `plain_neg` | lemma ない as aux, not after ます / です |
| `conditional` | lemma ば / たら / なら, or form starts with 仮定形 |
| `potential` / `passive` | lemma れる / られる (both flags fire; the JSON decides which is forbidden) |
| `causative` | lemma させる / せる |
| `relative` | form starts with 連体形, token is a verb, next word is a noun |
| `keigo` | lemma in a closed list: いらっしゃる, おっしゃる, なさる, くださる, いたす, 申す, 申し上げる, ございます, いただく, 差し上げる, 拝見, 承知 |

A1 also forbids lemmas such as ば, たら, なら, ながら, のに, ように, わけ, はず, べき.

**Any** hit on a forbidden construction or forbidden lemma fails the draft (`conj_hits == 0` required). Over-level lemma rate and POS rate still have caps. Case/tense rates are unused (stored 0; JSON caps are 1.0).

Unknown content lemmas count as over-level. The skip for “names” only fires when the surface is capitalized — rare in Japanese — so loanwords in katakana often count as unknown.

| Level | Allowed (simplified) |
| ----- | -------------------- |
| **A1** | です/ます only. Core particles. No て-form, plain past/neg, ている, conditionals, potential, causative, passive, relatives, keigo. Over-level cap 0.18. |
| **A2** | て-form, てください, plain た / ない. Still no ている, conditionals, potential, causative, passive, relatives, keigo. Over-level 0.20. |
| **B1** | ている, potential, causative, simple relatives, ば/たら/なら. No passive-as-voice, no keigo. Over-level 0.22, subordinate cap 0.28. |
| **B2** | Passive and modest keigo allowed. Vocab aimed at B2 / N3–N2. Over-level 0.30. |

Content POS for over-level and learner counts: `noun, verb, i-adj, na-adj, adverb`.

### Italian (`validator_it.py` + `data/grammar/it_cefr.json`)

Constructions are detected from spaCy tokens:

| Flag | Detection |
| ---- | --------- |
| `passato_prossimo` | AUX *essere/avere* followed by `VerbForm=part` |
| `imperfetto` | tense `impf` |
| `futuro` | tense `fut` |
| `condizionale` | mood `cond` |
| `congiuntivo` | mood `subj` |
| `gerundio` | form `ger` |
| `participio` | form `part` not in a compound tense |
| `passato_remoto` | finite past indicative |
| `relative_che` | lemma *che* after a noun |
| `clitic` / `clitic_cluster` | object clitics / fused or adjacent clitics |

**Any** hit on a forbidden construction fails the draft. Over-level lemma rate and subordinate rate still have caps. Proper nouns are skipped for over-level.

| Level | Allowed (simplified) |
| ----- | -------------------- |
| **A1** | Present indicative. No compounds, gerunds, subjunctives, relatives, clitics. |
| **A2** | Passato prossimo, futuro, simple clitics, *perché / quando / se*. |
| **B1** | Imperfetto, condizionale, gerundio, relative *che*. No congiuntivo. |
| **B2** | Congiuntivo allowed. Passato remoto still banned. |

Content POS for over-level and learner counts: `NOUN, VERB, ADJ, ADV, PROPN`.

### Arabic (`validator_ar.py` + `data/grammar/ar_cefr.json`)

Constructions are detected from CAMeL tokens:

| Flag | Detection |
| ---- | --------- |
| `perfect` | tense `past` |
| `imperfect` | tense `pres` |
| `future` | tense `fut` (سـ / سوف) |
| `dual` | number `du` |
| `inna` | إنّ / أنّ and sisters |
| `relative` | الذي / التي / … |
| `kana` / `kana_compound` | كان (and sisters) / كان + verb |
| `jussive` / `subjunctive` | mood `juss` / `subj` |
| `passive` | voice `pass` |
| `form_ii` … `form_x` / `derived_form` | verb Form II–X |

**Any** hit on a forbidden construction fails the draft. Over-level lemma rate and subordinate rate still have caps. Proper nouns are skipped for over-level.

| Level | Allowed (simplified) |
| ----- | -------------------- |
| **A1** | Present Form I and nominal sentences. No past, future, dual, إنّ, الذي, كان+verb, لم/لن, passive, Forms II–X. |
| **A2** | Past and future, Form II/IV, لأن / إذا / عندما. |
| **B1** | إنّ, الذي, dual, jussive/subjunctive, Forms II/IV/V/VII/VIII/X. Still no passive, VI, IX. |
| **B2** | Passive and remaining forms allowed. |

Content POS for over-level and learner counts: `NOUN, VERB, ADJ, ADV, PROPN`.

## Lexicons

| File | Size (approx.) | Purpose |
| ---- | -------------- | ------- |
| `data/vocab/ru_cefr.json` | ~5,400 lemmas | Lemma → A1–B2. Pedagogical core plus frequency banding from a 50k word list |
| `data/vocab/ja_cefr.json` | 3,000+ lemmas | Pedagogical core plus JMdict frequency bands |
| `data/vocab/it_cefr.json` | ~1,000 lemmas | Pedagogical Italian core, dictionary form |
| `data/vocab/ar_cefr.json` | ~775 lemmas | Pedagogical MSA core, undiacritized dictionary form |
| `data/gloss/ru_en.json` | ~1,360 | Short English glosses (not every frequency lemma has a gloss) |
| `data/gloss/ja_en.json` | 3,000+ | Short English glosses, keyed to dictionary form |
| `data/gloss/it_en.json` | ~1,000 | Short English glosses, keyed to lowercased lemma |
| `data/gloss/ar_en.json` | ~775 | Short English glosses, keyed to undiacritized lemma |
| `data/grammar/ru_cefr.json` | 4 levels | Allowed cases/tenses, forbidden POS/conjunctions, rate caps, prompt text |
| `data/grammar/ja_cefr.json` | 4 levels | Forbidden constructions/lemmas, rate caps, prompt text |
| `data/grammar/it_cefr.json` | 4 levels | Forbidden constructions, tenses/moods, rate caps, prompt text |
| `data/grammar/ar_cefr.json` | 4 levels | Forbidden constructions, tenses/moods, verb forms, rate caps, prompt text |
| `data/kanji/ja.json` | ~13,100 | Character → on, kun, meanings, strokes, JLPT, grade, freq, radical, parts |
| `data/roots/ar.json` | ~197 | Arabic root → spaced letters + English gloss |

Russian vocab bands are TORFL-inspired pedagogical assignments plus frequency ranks (top ~500 → A1, ~1500 A2, ~3000 B1, rest of the kept list B2). They are **not** a licensed official word list.

Japanese banding (`scripts/build_ja_lexicon.py`):

1. Hand pedagogical list wins (particles, function words, N5–N3 core with glosses).
2. OpenJLPT N5–N2 vocabulary (plus JMdict frequency bands when available). **N5 → A1**, **N4 → A2**, **N3 → B1**, **N2 → B2**. `ichi1` / `news1` / `spec1` without a tighter nf tag land in B2.
3. First English gloss from JMdict is stored. Target is 3,000+ dictionary forms so A1/A2 generation does not false-flag common lemmas as unknown.

`data/raw/` is gitignored. Rebuild:

```
python3 scripts/build_ja_lexicon.py
python3 scripts/build_kanji.py
python3 scripts/build_lexicon.py   # needs pymorphy3; optionally data/raw/ru_50k.txt
python3 scripts/build_it_lexicon.py
python3 scripts/build_ar_lexicon.py
```

Grammar JSON is edited by hand.

## Translation

`translate_passage` asks for natural English with the same paragraph breaks, temperature 0.2. Failure or missing key → `null`. `ensure_translation` fills a stored empty column on first `GET …/translation`.

## Known NLP failure modes

- spaCy Italian first-token morph can miss passato remoto vs compound past; the validator then flags or misses it.
- pymorphy3 first-parse can be the wrong lemma or case; the validator then flags or misses it.
- Sudachi mode C still splits in ways that confuse て+いる and relative-clause detection.
- `れる/られる` is tagged as both potential and passive; B1 forbids `passive` so potential られる can false-fail B1.
- Japanese construction detection will both over- and under-flag (heuristic).
- CAMeL Form I–X mapping is heuristic on وزن patterns; a mis-tagged Form II verb can fail an A1 seed.
- Without the CAMeL morphology database, Arabic tokens still split but POS/root stay empty, so the validator barely flags grammar.
- Quarantine means failed calibrations never wear a public CEFR badge.
