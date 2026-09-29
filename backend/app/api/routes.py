import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse, Response as PlainResponse, JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.db import GenerationJobRow, PassageRow, SessionLocal, UserRow
from app.models.schemas import (
    ComprehensionSubmit,
    FeedbackRequest,
    FeedbackResponse,
    GenerateJobResponse,
    GenerateRequest,
    GlossRequest,
    GlossResponse,
    LibraryResponse,
    MagicLinkRequest,
    PlacementRead,
    PlacementResult,
    PlacementChoose,
    PlacementSubmit,
    AdminOverview,
    MeResponse,
    NewsSaveRequest,
    PassageResponse,
    PassageStats,
    ReviewSubmit,
    StarredWord,
    StarRequest,
    TranslationResponse,
    TapRequest,
    TrialEventRequest,
    UnstarRequest,
)
from app.services.admin import admin_overview, is_admin_user, require_admin
from app.services.anki_export import apkg_bytes, csv_bytes
from app.services.auth import (
    consume_magic_link,
    create_magic_link,
    exchange_google_code,
    finish_login,
    get_or_create_google_user,
    google_authorize_url,
    clear_auth_cookie,
)
from app.services.identity import Identity, merge_guest_into_user, valid_device_id
from app.services.generate import (
    complete_read,
    ensure_translation,
    find_cached_passage,
    get_passage,
)
from app.services.generation_jobs import (
    enqueue_generation,
    job_owned_by,
    job_to_response,
)
from app.services.gloss import resolve_gloss
from app.services.learner import (
    DEFAULT_LEVEL,
    get_learner,
    get_or_create_learner,
    lemma_token_stats,
    list_stars,
    pick_next_id,
    read_ids,
    recent_taps,
    record_tap,
    seen_lemmas,
    set_placed_level,
    star_lemma,
    starred_lemmas,
    tokens_from_row,
    unstar_lemma,
)
from app.services.library import list_library, shelf_counts
from app.services.news import save_news
from app.services.morph import analyze_word
from app.services.quota import consume_generate, remaining_generates
from app.services.rate_limit import rate_limit
from app.services.srs import due_cards, due_count, review_card
from app.services.trial import (
    SERVER_EVENTS,
    record_account_linked,
    record_event,
    trial_metrics,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

SUPPORTED_LANGUAGES = {"ru", "ja", "it", "ar"}


def require_language(language: str) -> str:
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail="language must be ru, ja, it, or ar")
    if language == "ru" and not settings.show_russian:
        raise HTTPException(status_code=404, detail="Russian is not on the public shelf.")
    if language == "it" and not settings.show_italian:
        raise HTTPException(status_code=404, detail="Italian is not on the public shelf.")
    if language == "ar" and not settings.show_arabic:
        raise HTTPException(status_code=404, detail="Arabic is not on the public shelf.")
    return language


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_identity(
    request: Request,
    x_device_id: str | None = Header(default=None),
) -> Identity:
    return Identity(
        user_id=getattr(request.state, "user_id", None),
        device_id=valid_device_id(x_device_id),
    )


@router.get("/health")
def health():
    return {"ok": True, "name": "lociros"}


@router.get("/health/ready")
def ready(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"ok": True, "name": "lociros", "db": True}


@router.get("/me", response_model=MeResponse)
def me(request: Request, db: Session = Depends(get_db), identity: Identity = Depends(get_identity)):
    user = db.get(UserRow, identity.user_id) if identity.user_id else None
    remaining = remaining_generates(db, identity) if identity.can_persist else 0
    return MeResponse(
        authenticated=user is not None,
        user_id=user.id if user else None,
        email=user.email if user else None,
        display_name=user.display_name if user else None,
        guest=user is None,
        show_russian=settings.show_russian,
        show_italian=settings.show_italian,
        show_arabic=settings.show_arabic,
        generate_remaining=remaining if identity.can_persist else None,
        require_auth=settings.require_auth,
        admin=is_admin_user(user),
    )


@router.delete("/me")
def delete_me(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    if not identity.user_id:
        raise HTTPException(status_code=401, detail="Sign in to delete an account.")
    user = db.get(UserRow, identity.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found")
    from app.models.db import (
        GenerateQuotaRow,
        LearnerCardRow,
        LearnerLemmaRow,
        LearnerReadRow,
        LearnerRow,
        LearnerStarRow,
        LearnerTapRow,
        LearnerNewsSaveRow,
        MagicLinkRow,
        TrialEventRow,
    )

    for model in (
        LearnerCardRow,
        LearnerLemmaRow,
        LearnerStarRow,
        LearnerReadRow,
        LearnerRow,
        LearnerTapRow,
        LearnerNewsSaveRow,
        TrialEventRow,
    ):
        db.query(model).filter(model.user_id == user.id).delete()
    db.query(GenerateQuotaRow).filter(
        GenerateQuotaRow.account_key == f"user:{user.id}"
    ).delete()
    if user.email:
        db.query(MagicLinkRow).filter(MagicLinkRow.email == user.email).delete()
    db.delete(user)
    db.commit()
    clear_auth_cookie(response)
    return {"ok": True}


@router.post("/auth/session")
def auth_session(
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    """Attach guest device progress after a Supabase sign-in."""
    if not identity.user_id:
        raise HTTPException(status_code=401, detail="Sign in first.")
    if identity.device_id:
        merge_guest_into_user(db, identity.device_id, identity.user_id)
        record_account_linked(db, identity)
    return {"ok": True, "user_id": identity.user_id}


def require_legacy_auth() -> None:
    """Magic-link and Google cookie sign-in predate Supabase Auth.

    Magic links are never emailed (the link comes back in the response), and
    the Google flow uses the device id as OAuth state, so neither is safe to
    expose in production.
    """
    if settings.is_production:
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/auth/google", dependencies=[Depends(require_legacy_auth)])
def auth_google(request: Request):
    state = request.query_params.get("device_id") or ""
    return RedirectResponse(google_authorize_url(state))


@router.get("/auth/google/callback", dependencies=[Depends(require_legacy_auth)])
def auth_google_callback(
    request: Request,
    db: Session = Depends(get_db),
    code: str | None = None,
    state: str | None = None,
):
    if not code:
        raise HTTPException(status_code=400, detail="Missing code")
    info = exchange_google_code(code)
    user = get_or_create_google_user(
        db,
        str(info.get("sub")),
        info.get("email"),
        info.get("name"),
    )
    response = RedirectResponse(f"{settings.public_base_url}/library")
    finish_login(db, response, user, valid_device_id(state))
    return response


@router.post("/auth/magic", dependencies=[Depends(require_legacy_auth)])
def auth_magic(body: MagicLinkRequest, db: Session = Depends(get_db)):
    link = create_magic_link(db, body.email)
    return {"ok": True, "link": link}


@router.get("/auth/magic/callback", dependencies=[Depends(require_legacy_auth)])
def auth_magic_callback(
    token: str,
    db: Session = Depends(get_db),
    device_id: str | None = None,
):
    user = consume_magic_link(db, token)
    response = RedirectResponse(f"{settings.public_base_url}/library")
    finish_login(db, response, user, valid_device_id(device_id))
    return response


@router.post("/auth/logout")
def auth_logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@router.post("/generate", dependencies=[Depends(rate_limit("generate", 6))])
def post_generate(
    body: GenerateRequest,
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    if settings.require_auth and not identity.user_id:
        raise HTTPException(
            status_code=401,
            detail="Sign in to generate a custom passage. The catalog is free to read.",
        )
    if not identity.can_persist:
        raise HTTPException(
            status_code=401,
            detail="A device id is required to generate a custom passage.",
        )
    require_language(body.language)
    topic = body.topic.strip()
    cached = find_cached_passage(db, body.level, topic, body.genre, body.language)
    if cached is not None:
        return cached
    consume_generate(db, identity)
    known = (
        sorted(seen_lemmas(db, identity, body.language))
        if identity.can_persist
        else []
    )
    reuse = recent_taps(db, identity, body.language) if identity.can_persist else []
    try:
        job = enqueue_generation(
            db,
            level=body.level,
            topic=topic,
            genre=body.genre,
            language=body.language,
            identity=identity,
            known_lemmas=known or None,
            reuse_lemmas=reuse or None,
        )
    except HTTPException:
        raise
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    payload = job_to_response(db, job)
    return JSONResponse(status_code=202, content=payload.model_dump(mode="json"))


@router.get("/generate/{job_id}", response_model=GenerateJobResponse)
def get_generate_job(
    job_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    job = db.get(GenerationJobRow, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Generation job not found")
    if not job_owned_by(job, identity):
        raise HTTPException(status_code=404, detail="Generation job not found")
    return job_to_response(db, job)


@router.get("/shelf/counts")
def get_shelf_counts(db: Session = Depends(get_db)):
    counts = shelf_counts(db)
    shown = {
        "ja": True,
        "ru": settings.show_russian,
        "it": settings.show_italian,
        "ar": settings.show_arabic,
    }
    return {"counts": {lang: n for lang, n in counts.items() if shown.get(lang)}}


@router.get("/library", response_model=LibraryResponse)
def get_library(
    language: str = "ja",
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    require_language(language)
    if identity.can_persist:
        learner = get_learner(db, identity, language)
        level = learner.level if learner is not None else DEFAULT_LEVEL
        try:
            from app.services.news import schedule_daily_news

            schedule_daily_news(language, level)
        except Exception:
            logger.exception("Could not schedule daily news")
    return list_library(db, language, identity)


@router.get("/passages/{passage_id}", response_model=PassageResponse)
def get_passage_route(
    passage_id: str,
    lab: bool = Query(default=False),
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    include_quarantine = False
    if lab and identity.user_id:
        include_quarantine = is_admin_user(db.get(UserRow, identity.user_id))
    passage = get_passage(db, passage_id, include_quarantine=include_quarantine)
    if passage is None:
        raise HTTPException(status_code=404, detail="Passage not found")
    return passage


@router.get(
    "/passages/{passage_id}/translation",
    response_model=TranslationResponse,
    dependencies=[Depends(rate_limit("translation", 30))],
)
def get_passage_translation(
    passage_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    if not identity.can_persist:
        raise HTTPException(status_code=401, detail="A device id is required for translations.")
    if get_passage(db, passage_id) is None:
        raise HTTPException(status_code=404, detail="Passage not found")
    translation = ensure_translation(db, passage_id)
    if translation is None:
        raise HTTPException(status_code=503, detail="Translation is not available yet.")
    return TranslationResponse(passage_id=passage_id, translation=translation)


@router.get("/passages/{passage_id}/stats", response_model=PassageStats)
def get_passage_stats(
    passage_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    row = db.get(PassageRow, passage_id)
    if row is None or get_passage(db, passage_id) is None:
        raise HTTPException(status_code=404, detail="Passage not found")
    language = row.language or "ru"
    placement = DEFAULT_LEVEL
    already: set[str] = set()
    seen: set[str] = set()
    if identity.can_persist:
        learner = get_learner(db, identity, language)
        if learner is not None:
            placement = learner.level
        seen = seen_lemmas(db, identity, language)
        already = read_ids(db, identity)
    new, recycled = lemma_token_stats(tokens_from_row(row), language, seen)
    tapped = set(recent_taps(db, identity, language)) if identity.can_persist else set()
    next_id = pick_next_id(
        db, language, placement, already, exclude_id=passage_id, tapped=tapped
    )
    starred = sorted(starred_lemmas(db, identity, language)) if identity.can_persist else []
    return PassageStats(
        passage_id=passage_id,
        language=language,  # type: ignore[arg-type]
        placement=placement,  # type: ignore[arg-type]
        read=passage_id in already,
        new_lemmas=new,
        recycled_lemmas=recycled,
        next_id=next_id,
        known_lemmas=sorted(seen),
        starred_lemmas=starred,
    )


@router.post(
    "/gloss",
    response_model=GlossResponse,
    dependencies=[Depends(rate_limit("gloss", 120))],
)
def post_gloss(body: GlossRequest, db: Session = Depends(get_db)):
    word = body.word.strip()
    if body.passage_id:
        passage = get_passage(db, body.passage_id)
        if passage:
            for tok in passage.tokens:
                if tok.is_word and tok.text == word:
                    morph = tok.morph
                    if morph is None:
                        break
                    return GlossResponse(
                        word=word,
                        lemma=morph.lemma,
                        morph=morph,
                        gloss=tok.gloss,
                        level=tok.level,
                        kanji=tok.kanji,
                        root=tok.root,
                        role=tok.role,
                        conj=tok.conj,
                    )
    lang = "ru"
    if body.passage_id:
        passage = get_passage(db, body.passage_id)
        if passage:
            lang = passage.language
    morph = analyze_word(word, lang)
    kanji = []
    if lang == "ja":
        from app.services.kanji import breakdown

        kanji = breakdown(word, morph.reading)
    from app.models.schemas import Token
    from app.services.grammar import attach_grammar

    live = Token(text=word, lemma=morph.lemma, morph=morph, is_word=True, kanji=kanji)
    if lang == "ar":
        from app.services.morph_ar import analyze_text_ar

        analyzed = analyze_text_ar(word, "ar")
        word_tok = next((t for t in analyzed if t.is_word), None)
        if word_tok:
            live.root = word_tok.root
            live.morph = word_tok.morph or morph
            live.lemma = word_tok.lemma or morph.lemma
            morph = live.morph
    attach_grammar([live], lang)
    return GlossResponse(
        word=word,
        lemma=live.lemma or morph.lemma,
        morph=morph,
        gloss=resolve_gloss(live.lemma or morph.lemma, lang, morph=morph),
        level=None,
        kanji=kanji,
        root=live.root,
        role=live.role,
        conj=live.conj,
    )


@router.post("/feedback", response_model=FeedbackResponse)
def post_feedback(
    body: FeedbackRequest,
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    result = complete_read(db, body.passage_id, body.rating, identity)
    if result is None:
        raise HTTPException(status_code=404, detail="Passage not found")
    return FeedbackResponse(**result)


@router.get("/words", response_model=list[StarredWord])
def get_words(
    language: str = "ja",
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    require_language(language)
    if not identity.can_persist:
        return []
    return list_stars(db, identity, language)


@router.post("/words", response_model=StarredWord)
def post_word(
    body: StarRequest,
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    if not identity.can_persist:
        raise HTTPException(status_code=400, detail="A device id is required to save a word.")
    language = body.language
    lemma = body.lemma.strip()
    reading = None
    gloss_from_passage = None
    if body.passage_id:
        passage = get_passage(db, body.passage_id)
        if passage is None:
            raise HTTPException(status_code=404, detail="Passage not found")
        language = passage.language
        for tok in passage.tokens:
            if tok.lemma != lemma:
                continue
            if tok.morph and tok.morph.reading and not reading:
                reading = tok.morph.reading
            if tok.gloss and not gloss_from_passage:
                gloss_from_passage = tok.gloss
            if reading and gloss_from_passage:
                break
    require_language(language)
    if not lemma:
        raise HTTPException(status_code=400, detail="lemma is required")
    # Trust the client's gloss when it sent one, but never save a word with
    # no meaning at all just because the client's copy of the passage was
    # stale — fall back to the passage's own (already re-checked) token, then
    # to a fresh lookup.
    gloss = body.gloss.strip() if body.gloss else None
    if not gloss:
        gloss = gloss_from_passage or resolve_gloss(lemma, language)
    return star_lemma(
        db,
        identity,
        language,
        lemma,
        gloss,
        body.passage_id,
        reading=reading,
    )


@router.delete("/words", response_model=dict)
def delete_word(
    body: UnstarRequest,
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    if not identity.can_persist:
        raise HTTPException(status_code=400, detail="A device id is required to remove a word.")
    unstar_lemma(db, identity, body.language, body.lemma.strip())
    return {"ok": True}


@router.get("/words/export.csv")
def export_words_csv(
    language: str = "ja",
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    if not identity.can_persist:
        raise HTTPException(status_code=401, detail="Sign in or keep this browser to export.")
    data = csv_bytes(db, identity, language)
    return PlainResponse(
        data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="lociros-words.csv"'},
    )


@router.get("/words/export.apkg")
def export_words_apkg(
    language: str = "ja",
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    if not identity.can_persist:
        raise HTTPException(status_code=401, detail="Sign in or keep this browser to export.")
    data = apkg_bytes(db, identity, language)
    return PlainResponse(
        data,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="lociros-words.apkg"'},
    )


@router.get("/review")
def get_review(
    language: str = "ja",
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    if not identity.can_persist:
        return {"due": 0, "cards": []}
    cards = due_cards(db, identity, language)
    return {"due": due_count(db, identity, language), "cards": cards}


@router.post("/review")
def post_review(
    body: ReviewSubmit,
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    if not identity.can_persist:
        raise HTTPException(status_code=400, detail="Nothing to review yet.")
    try:
        card = review_card(db, identity, body.card_id, body.rating)
    except KeyError:
        raise HTTPException(status_code=404, detail="Card not found") from None
    return card


@router.get("/placement", response_model=PlacementRead)
def get_placement(language: str = "ja"):
    require_language(language)
    from app.services.placement import placement_read

    return placement_read(language)


@router.post("/placement", response_model=PlacementResult)
def post_placement(
    body: PlacementSubmit,
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    require_language(body.language)
    if not identity.can_persist:
        raise HTTPException(status_code=400, detail="A device id is required to save a level.")
    from app.services.placement import score_placement

    try:
        correct, total, level = score_placement(body.language, body.answers)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    learner = get_or_create_learner(db, identity, body.language)
    set_placed_level(learner, level)
    record_event(
        db,
        kind="placement_done",
        identity=identity,
        payload={"language": body.language, "level": level},
        commit=False,
    )
    db.commit()
    next_id = pick_next_id(
        db,
        body.language,
        level,
        read_ids(db, identity),
        tapped=set(recent_taps(db, identity, body.language)),
    )
    return PlacementResult(
        language=body.language,
        level=level,  # type: ignore[arg-type]
        correct=correct,
        total=total,
        placed=True,
        next_id=next_id,
    )


@router.post("/placement/choose", response_model=PlacementResult)
def post_placement_choose(
    body: PlacementChoose,
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    require_language(body.language)
    if not identity.can_persist:
        raise HTTPException(status_code=400, detail="A device id is required to save a level.")
    learner = get_or_create_learner(db, identity, body.language)
    level = set_placed_level(learner, body.level)
    record_event(
        db,
        kind="placement_done",
        identity=identity,
        payload={"language": body.language, "level": level, "source": "chosen"},
        commit=False,
    )
    db.commit()
    next_id = pick_next_id(
        db,
        body.language,
        level,
        read_ids(db, identity),
        tapped=set(recent_taps(db, identity, body.language)),
    )
    return PlacementResult(
        language=body.language,
        level=level,  # type: ignore[arg-type]
        correct=0,
        total=0,
        placed=True,
        next_id=next_id,
    )


@router.post("/news/save")
def post_news_save(
    body: NewsSaveRequest,
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    require_language(body.language)
    if not identity.can_persist:
        raise HTTPException(status_code=400, detail="A device id is required to save a passage.")
    try:
        saved = save_news(db, identity, body.passage_id, body.language, body.saved)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "saved": saved}


@router.post("/taps")
def post_tap(
    body: TapRequest,
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    require_language(body.language)
    if identity.can_persist:
        record_tap(db, identity, body.language, body.lemma)
    return {"ok": True}


@router.post("/comprehension")
def post_comprehension(
    body: ComprehensionSubmit,
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    passage = get_passage(db, body.passage_id)
    if passage is None:
        raise HTTPException(status_code=404, detail="Passage not found")
    questions = passage.comprehension
    if len(body.answers) != len(questions):
        raise HTTPException(status_code=400, detail="Answer every question.")
    correct = [
        ans == q.answer_index for ans, q in zip(body.answers, questions)
    ]
    record_event(
        db,
        kind="comprehension",
        identity=identity,
        passage_id=body.passage_id,
        payload={"correct": sum(correct), "total": len(correct)},
    )
    return {"ok": True, "correct": sum(correct), "total": len(correct), "detail": correct}


@router.post("/events", dependencies=[Depends(rate_limit("events", 60))])
def post_event(
    body: TrialEventRequest,
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    if body.kind in SERVER_EVENTS:
        raise HTTPException(status_code=400, detail="That event is recorded by the server.")
    if body.kind == "session_start" and not identity.device_id:
        return {"ok": True}
    record_event(
        db,
        kind=body.kind,
        identity=identity,
        passage_id=body.passage_id,
        payload=body.payload,
    )
    return {"ok": True}


@router.get("/admin/overview", response_model=AdminOverview)
def get_admin_overview(
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    require_admin(db, identity)
    return admin_overview(db)


@router.get("/trial/metrics")
def get_trial_metrics(
    days: int = 30,
    db: Session = Depends(get_db),
    identity: Identity = Depends(get_identity),
):
    require_admin(db, identity)
    return trial_metrics(db, days=days)


@router.get("/audio/{filename}")
def get_audio(filename: str):
    from pathlib import Path

    from app.services import audio_store

    safe = Path(filename).name
    if safe.suffix.lower() != ".mp3":
        raise HTTPException(status_code=404, detail="Audio not found")
    data = audio_store.get_mp3(safe.stem)
    if data is None:
        raise HTTPException(status_code=404, detail="Audio not found")
    return PlainResponse(data, media_type="audio/mpeg")
