import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

CefrLevel = Literal["A1", "A2", "B1", "B2"]
LangCode = Literal["ru", "ja", "it", "ar"]
FeedbackRating = Literal["too_easy", "too_hard", "just_right"]
GENRES = ("daily_life", "travel", "news", "folklore", "work")


class GenerateRequest(BaseModel):
    level: CefrLevel
    topic: str = Field(..., min_length=1, max_length=200)
    genre: str | None = Field(default=None, max_length=40)
    language: LangCode = "ja"


class GlossRequest(BaseModel):
    word: str = Field(..., min_length=1, max_length=80)
    passage_id: str | None = None


class FeedbackRequest(BaseModel):
    passage_id: str
    rating: FeedbackRating


class LibraryItem(BaseModel):
    id: str
    language: LangCode
    level: CefrLevel
    topic: str
    genre: str | None
    title: str
    word_count: int
    created_at: datetime
    passed: bool
    read: bool = False
    recommended: bool = False
    new_lemmas: int = 0
    recycled_lemmas: int = 0
    series_id: str | None = None
    chapter_index: int | None = None
    has_audio: bool = False
    new_lemma_pct: float = 0.0
    source_name: str | None = None
    source_url: str | None = None
    source_date: str | None = None


class StarredWord(BaseModel):
    lemma: str
    gloss: str | None = None
    passage_id: str | None = None
    title: str | None = None
    language: LangCode


class StarRequest(BaseModel):
    lemma: str = Field(..., min_length=1, max_length=120)
    gloss: str | None = Field(default=None, max_length=200)
    passage_id: str | None = None
    language: LangCode | None = None


class UnstarRequest(BaseModel):
    lemma: str = Field(..., min_length=1, max_length=120)
    language: LangCode


class NewsNotice(BaseModel):
    passage_id: str
    title: str
    language: LangCode
    level: CefrLevel
    source_name: str | None = None
    source_date: str | None = None
    saved: bool = False
    read: bool = False


class NewsSaveRequest(BaseModel):
    passage_id: str
    language: LangCode
    saved: bool = True


class LibraryResponse(BaseModel):
    language: LangCode
    placement: CefrLevel
    placed: bool = True
    next_id: str | None = None
    seen_lemmas: int = 0
    items: list[LibraryItem]
    words: list[StarredWord] = []
    news_notice: NewsNotice | None = None


class PlacementQuestion(BaseModel):
    id: str
    prompt: str
    choices: list[str]


class PlacementSubmit(BaseModel):
    language: LangCode
    answers: list[int]


class PlacementChoose(BaseModel):
    language: LangCode
    level: CefrLevel


class PlacementResult(BaseModel):
    language: LangCode
    level: CefrLevel
    correct: int
    total: int
    placed: bool = True
    next_id: str | None = None


class TapRequest(BaseModel):
    lemma: str = Field(..., min_length=1, max_length=120)
    language: LangCode
    passage_id: str | None = None


class PassageStats(BaseModel):
    passage_id: str
    language: LangCode
    placement: CefrLevel
    read: bool = False
    new_lemmas: int = 0
    recycled_lemmas: int = 0
    next_id: str | None = None
    known_lemmas: list[str] = []
    starred_lemmas: list[str] = []


class KanjiPart(BaseModel):
    char: str
    reading: str | None = None
    on: list[str] = []
    kun: list[str] = []
    meaning: str = ""
    strokes: int | None = None
    jlpt: int | None = None
    grade: int | None = None
    freq: int | None = None
    radical: str | None = None
    radical_name: str | None = None
    parts: list[str] = []
    nanori: list[str] = []


class RootPart(BaseModel):
    """Arabic root + وزن, the gloss-card analog of a kanji breakdown."""

    letters: str
    pattern: str | None = None
    form: str | None = None
    form_name: str | None = None
    meaning: str = ""


class MorphInfo(BaseModel):
    lemma: str
    pos: str | None = None
    case: str | None = None
    gender: str | None = None
    number: str | None = None
    tense: str | None = None
    aspect: str | None = None
    mood: str | None = None
    reading: str | None = None
    form: str | None = None
    pos_detail: str | None = None
    conj_type: str | None = None
    voice: str | None = None
    person: str | None = None
    state: str | None = None
    enclitic: str | None = None


class ConjPiece(BaseModel):
    text: str
    label: str


class Token(BaseModel):
    text: str
    ws: str = " "
    is_word: bool = True
    lemma: str | None = None
    morph: MorphInfo | None = None
    gloss: str | None = None
    level: str | None = None
    kanji: list[KanjiPart] = []
    root: RootPart | None = None
    role: str | None = None
    conj: list[ConjPiece] = []
    conj_id: int | None = None


class PlacementRead(BaseModel):
    language: LangCode
    title: str
    text: str
    tokens: list[Token]
    questions: list[PlacementQuestion]


class Calibration(BaseModel):
    passed: bool
    attempts: int
    overlevel_lemma_rate: float
    subordinate_rate: float
    forbidden_case_rate: float
    forbidden_tense_rate: float
    forbidden_pos_rate: float
    flags: list[str]
    warnings: list[str]
    allowed_constructions: list[str] = []
    forbidden_used: list[str] = []
    banned_constructions: list[str] = []
    sample_lemmas: list[str] = []


class AudioCue(BaseModel):
    index: int
    start_ms: int
    end_ms: int
    text: str


class ComprehensionChoice(BaseModel):
    id: str
    text: str


class ComprehensionQuestion(BaseModel):
    id: str
    prompt: str
    choices: list[str]
    answer_index: int


GenerateJobStatus = Literal["pending", "running", "completed", "failed"]


class PassageResponse(BaseModel):
    id: str
    language: LangCode = "ja"
    level: CefrLevel
    topic: str
    genre: str | None
    title: str
    text: str
    tokens: list[Token]
    calibration: Calibration
    word_count: int
    created_at: datetime
    translation: str | None = None
    shelf_status: str = "public"
    audio_url: str | None = None
    audio_cues: list[AudioCue] = []
    series_id: str | None = None
    chapter_index: int | None = None
    comprehension: list[ComprehensionQuestion] = []
    source_name: str | None = None
    source_url: str | None = None
    source_date: str | None = None


class GenerateJobResponse(BaseModel):
    job_id: str
    status: GenerateJobStatus
    passage: PassageResponse | None = None
    error: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None


class GlossResponse(BaseModel):
    word: str
    lemma: str
    morph: MorphInfo
    gloss: str | None
    level: str | None
    kanji: list[KanjiPart] = []
    root: RootPart | None = None
    role: str | None = None
    conj: list[ConjPiece] = []


class TranslationResponse(BaseModel):
    passage_id: str
    translation: str


class FeedbackResponse(BaseModel):
    ok: bool
    passage_id: str
    rating: FeedbackRating
    placement: CefrLevel | None = None
    next_id: str | None = None
    new_lemmas: int = 0
    recycled_lemmas: int = 0


class MeResponse(BaseModel):
    authenticated: bool
    user_id: int | None = None
    email: str | None = None
    display_name: str | None = None
    guest: bool = True
    show_russian: bool = False
    show_italian: bool = False
    show_arabic: bool = False
    generate_remaining: int | None = None
    require_auth: bool = False
    admin: bool = False
    entitlement: dict | None = None
    created_at: datetime | None = None


class CheckoutRequest(BaseModel):
    plan: Literal["monthly", "annual"] = "monthly"
    return_to: str | None = Field(default=None, max_length=300)


class ProfileUpdate(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=80)


class MagicLinkRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)


class ReviewCard(BaseModel):
    id: int
    lemma: str
    gloss: str | None = None
    reading: str | None = None
    context: str | None = None
    language: LangCode
    due_at: datetime


class ReviewSubmit(BaseModel):
    card_id: int
    rating: Literal["again", "hard", "good", "easy"]


class ComprehensionSubmit(BaseModel):
    passage_id: str
    answers: list[int]


class TrialEventRequest(BaseModel):
    kind: str = Field(..., min_length=1, max_length=40)
    passage_id: str | None = Field(default=None, max_length=80)
    payload: dict | None = None

    @field_validator("payload")
    @classmethod
    def _small_payload(cls, value: dict | None) -> dict | None:
        if value is not None and len(json.dumps(value, default=str)) > 2048:
            raise ValueError("payload is too large")
        return value


class AdminCount(BaseModel):
    key: str
    count: int


class AdminUserRow(BaseModel):
    id: int
    email: str | None = None
    display_name: str | None = None
    has_auth: bool = False
    created_at: datetime | None = None
    reads: int = 0
    stars: int = 0
    jobs: int = 0
    plan: str | None = None


class AdminJobRow(BaseModel):
    id: str
    status: str
    language: str
    level: str
    topic: str
    user_id: int | None = None
    error: str | None = None
    created_at: datetime | None = None
    finished_at: datetime | None = None


class AdminOverview(BaseModel):
    api: dict
    totals: dict[str, int]
    passages_by_language: list[AdminCount]
    passages_by_level: list[AdminCount]
    passages_by_shelf: list[AdminCount]
    jobs_by_status: list[AdminCount]
    activity_7d: dict[str, int]
    trial: dict
    llm_usage: list[dict] = []
    recent_users: list[AdminUserRow]
    recent_jobs: list[AdminJobRow]
