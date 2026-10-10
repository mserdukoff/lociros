"""Placement ladder: one short passage per band, A1 to B2, in each language.

A first placement starts at A1 and climbs until a passage is failed; the band is
the last one passed. A returning reader starts at their previous band: a pass
climbs, a fail steps down until a pass. Each passage has four questions and
passes at three, so guessing through a band is about one chance in nine.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.schemas import PlacementQuestion, PlacementRead

LEVELS = ("A1", "A2", "B1", "B2")
PASS_MARK = 3

# Questions are in English so they test the passage, not the prompt.
_LADDER: dict[str, dict[str, dict]] = {
    "ja": {
        "A1": {
            "title": "田中さんの朝",
            "text": (
                "田中さんは毎朝駅で新聞を読みます。"
                "電車は八時に来ます。"
                "田中さんは会社へ行きます。"
                "会社で水を飲みます。"
            ),
            "questions": [
                ("Where does Tanaka read the newspaper?", ["at home", "at the station", "at school"], 1),
                ("What time does the train come?", ["seven o'clock", "nine o'clock", "eight o'clock"], 2),
                ("At the office, Tanaka drinks ___.", ["water", "milk", "tea"], 0),
                ("After reading the newspaper, where does Tanaka go?", ["to the market", "home", "to the office"], 2),
            ],
        },
        "A2": {
            "title": "週末の買い物",
            "text": (
                "土曜日、山田さんは妹と駅の近くのデパートへ行きました。"
                "妹は新しいくつがほしかったからです。"
                "でも、くつは高くて、妹は買いませんでした。"
                "二人は三階のレストランで昼ごはんを食べました。"
                "そのあと、山田さんは本屋で料理の本を一冊買いました。"
                "夜、家でその本を見て、カレーを作りました。"
            ),
            "questions": [
                ("Who went to the department store with Yamada?", ["her mother", "her younger sister", "a friend"], 1),
                ("Why didn't the sister buy the shoes?", ["they were expensive", "they were too small", "the shop was closed"], 0),
                ("Where did they eat lunch?", ["at home", "near the station", "in a restaurant on the third floor"], 2),
                ("What did Yamada make that evening with the new book?", ["a cake", "curry", "sushi"], 1),
            ],
        },
        "B1": {
            "title": "自転車で通勤する",
            "text": (
                "去年の春から、私は会社まで自転車で通っています。"
                "以前は毎朝満員電車に乗っていましたが、人が多すぎて、会社に着く前に疲れてしまいました。"
                "自転車に変えてから、朝の時間が楽しみになりました。"
                "片道四十分かかりますが、運動にもなるので、ジムに行く必要がなくなりました。"
                "雨の日だけは電車を使います。"
                "同僚の中には、危ないからやめたほうがいいと言う人もいます。"
                "でも、私は交通ルールを守っていれば大丈夫だと思っています。"
            ),
            "questions": [
                (
                    "Why did the writer stop taking the train?",
                    ["it was too expensive", "it was so crowded they were tired before work", "the station was far away"],
                    1,
                ),
                ("How long is the ride one way?", ["twenty minutes", "an hour", "forty minutes"], 2),
                ("When does the writer still take the train?", ["on rainy days", "on Mondays", "after working late"], 0),
                (
                    "What do some of the writer's coworkers say?",
                    ["the writer should join a gym", "cycling to work is dangerous", "cycling is too slow"],
                    1,
                ),
            ],
        },
        "B2": {
            "title": "地方に移り住む若者",
            "text": (
                "近年、都会を離れて地方に移り住む若者が増えている。"
                "その背景には、インターネットの普及によって、場所を選ばずに働けるようになったことがある。"
                "家賃が安く、自然が豊かな環境で暮らせることは確かに魅力的だ。"
                "しかし、移住した人が皆、満足しているわけではない。"
                "仕事の機会が限られているうえに、地域の人間関係になじめず、数年で都会に戻る人も少なくない。"
                "そのため、移住を支援する自治体の中には、住まいだけでなく、地元の人と交流する場を用意するところも出てきた。"
                "移住が成功するかどうかは、経済的な条件よりも、地域とのつながりを築けるかにかかっていると言えるだろう。"
            ),
            "questions": [
                (
                    "What made it possible for young people to move to the countryside?",
                    ["cheaper trains", "being able to work from anywhere thanks to the internet", "cash payments from the state"],
                    1,
                ),
                (
                    "Why do some return to the city within a few years?",
                    ["the climate is too harsh", "rents rise quickly", "few jobs and trouble fitting in locally"],
                    2,
                ),
                (
                    "Besides housing, what do some local governments now provide?",
                    ["places to meet local residents", "free cars", "language classes"],
                    0,
                ),
                (
                    "What does the writer say matters most for a move to succeed?",
                    ["the salary", "building ties with the community", "the size of the house"],
                    1,
                ),
            ],
        },
    },
    "ru": {
        "A1": {
            "title": "Это Анна",
            "text": (
                "Это Анна. Анна — студентка. Её брат Иван — врач. "
                "Их собака маленькая и белая. Их мама — учитель."
            ),
            "questions": [
                ("Who is Anna?", ["a doctor", "a student", "a teacher"], 1),
                ("What is Ivan's job?", ["teacher", "student", "doctor"], 2),
                ("Their dog is small and ___.", ["white", "black", "brown"], 0),
                ("Who is a teacher?", ["Anna", "Ivan", "their mother"], 2),
            ],
        },
        "A2": {
            "title": "Новая работа",
            "text": (
                "В прошлом месяце Максим начал работать в банке. "
                "Год назад он жил в маленьком городе, а теперь живёт в Москве. "
                "Каждое утро он едет на работу на метро, потому что машины у него нет. "
                "Работа ему нравится, но день очень длинный. "
                "Вечером он часто ужинает в кафе около дома. "
                "В субботу Максим позвонил маме и рассказал ей о новой жизни."
            ),
            "questions": [
                ("Where does Maxim work now?", ["at a school", "in a bank", "in a café"], 1),
                ("How does he get to work?", ["by car", "by bus", "by metro"], 2),
                ("Why does he take the metro?", ["he has no car", "it is cheap", "it is fast"], 0),
                ("What did Maxim do on Saturday?", ["visited his mother", "called his mother", "went to a café with friends"], 1),
            ],
        },
        "B1": {
            "title": "Почему я учу языки",
            "text": (
                "Когда я учился в школе, иностранные языки казались мне скучными. "
                "Учитель заставлял нас переводить длинные тексты, и я не понимал, зачем это нужно. "
                "Всё изменилось, когда я впервые поехал в Италию. "
                "Я не мог даже спросить дорогу и чувствовал себя беспомощным. "
                "Когда я вернулся домой, я записался на курсы итальянского. "
                "Теперь я занимаюсь три раза в неделю и каждый вечер смотрю фильмы на итальянском. "
                "Именно та поездка заставила меня по-настоящему заинтересоваться языками. "
                "Я думаю, что язык легче учить, если у тебя есть настоящая цель."
            ),
            "questions": [
                ("What did the writer think of languages at school?", ["they were boring", "they were too hard", "they were useful"], 0),
                (
                    "What happened on the first trip to Italy?",
                    ["he missed his train", "he could not even ask for directions", "he met his future teacher"],
                    1,
                ),
                ("How often does he study now?", ["every day", "once a week", "three times a week"], 2),
                ("What makes a language easier to learn, in his view?", ["a strict teacher", "a real goal", "translating long texts"], 1),
            ],
        },
        "B2": {
            "title": "Город без машин",
            "text": (
                "В последние годы всё больше европейских городов ограничивают движение автомобилей в центре. "
                "Сторонники этой идеи утверждают, что воздух становится чище, а улицы — безопаснее для пешеходов. "
                "Кроме того, освободившееся пространство можно отдать под парки и велосипедные дорожки. "
                "Однако не все жители согласны с такими мерами. "
                "Владельцы магазинов опасаются, что покупатели, привыкшие приезжать на машине, начнут ездить в торговые центры за городом. "
                "Исследования показывают, что эти опасения часто преувеличены: после закрытия улиц для машин число посетителей нередко даже растёт. "
                "Тем не менее успех зависит от того, насколько удобен общественный транспорт, который должен заменить автомобиль."
            ),
            "questions": [
                ("What do supporters say a car-free centre brings?", ["cleaner air and safer streets", "lower taxes", "more parking"], 0),
                (
                    "What are shop owners afraid of?",
                    ["higher rents", "customers driving to malls outside the city", "more bicycle theft"],
                    1,
                ),
                (
                    "What does research often show once streets close to cars?",
                    ["shops close", "the air stays the same", "visitor numbers often rise"],
                    2,
                ),
                (
                    "What does success depend on, according to the text?",
                    ["how convenient public transport is", "how many parks are built", "the size of the city"],
                    0,
                ),
            ],
        },
    },
    "it": {
        "A1": {
            "title": "La mattina di Luca",
            "text": (
                "Ogni mattina Luca va al mercato. Compra pane e acqua. "
                "Poi Luca torna a casa. A casa beve il tè."
            ),
            "questions": [
                ("Where does Luca go every morning?", ["to the office", "to the market", "to school"], 1),
                ("What does Luca buy?", ["tea and milk", "a newspaper", "bread and water"], 2),
                ("After the market, Luca goes ___.", ["to the station", "home", "to work"], 1),
                ("What does Luca drink at home?", ["tea", "water", "coffee"], 0),
            ],
        },
        "A2": {
            "title": "Una gita al lago",
            "text": (
                "Domenica scorsa Giulia e suo fratello sono andati al lago in treno. "
                "Il viaggio è durato un'ora. "
                "Quel giorno ha fatto molto caldo, quindi hanno fatto il bagno. "
                "A pranzo hanno mangiato in un piccolo ristorante vicino all'acqua. "
                "Nel pomeriggio ha cominciato a piovere e sono tornati alla stazione. "
                "Giulia è tornata a casa stanca ma contenta."
            ),
            "questions": [
                ("How did Giulia and her brother get to the lake?", ["by car", "by train", "by bike"], 1),
                ("Why did they go swimming?", ["it was very hot", "a friend invited them", "they had a lesson"], 0),
                ("Why did they go back to the station?", ["the restaurant was closed", "their train was leaving", "it started to rain"], 2),
                ("How did Giulia feel at the end of the day?", ["sad", "tired but happy", "bored"], 1),
            ],
        },
        "B1": {
            "title": "Lavorare da casa",
            "text": (
                "Da quando la mia azienda ha permesso di lavorare da casa, la mia giornata è cambiata molto. "
                "Prima passavo quasi due ore al giorno in macchina, mentre adesso posso usare quel tempo per fare sport o cucinare. "
                "All'inizio pensavo che sarebbe stato perfetto, ma dopo qualche mese ho cominciato a sentirmi un po' solo. "
                "Mi mancavano le pause caffè con i colleghi e le chiacchiere in ufficio. "
                "Per questo ho deciso di andare in ufficio due giorni alla settimana. "
                "Secondo me questa soluzione è la migliore, perché mi permette di avere la tranquillità di casa e anche il contatto con gli altri."
            ),
            "questions": [
                ("How long did the writer use to spend driving each day?", ["about thirty minutes", "almost two hours", "four hours"], 1),
                ("What problem began after a few months?", ["feeling a bit lonely", "too much noise at home", "a slow internet connection"], 0),
                (
                    "What did the writer miss?",
                    ["the office canteen", "the drive to work", "coffee breaks and chats with colleagues"],
                    2,
                ),
                (
                    "What did the writer decide to do?",
                    ["quit the job", "go to the office two days a week", "work from home every day"],
                    1,
                ),
            ],
        },
        "B2": {
            "title": "Il turismo nelle città d'arte",
            "text": (
                "Negli ultimi anni città come Venezia e Firenze hanno accolto un numero di turisti sempre maggiore. "
                "Se da un lato il turismo porta lavoro e ricchezza, dall'altro rischia di trasformare i centri storici in luoghi pensati soltanto per i visitatori. "
                "Molti residenti, a causa degli affitti sempre più alti, sono stati costretti a trasferirsi in periferia, "
                "e i negozi di quartiere sono stati sostituiti da bar e negozi di souvenir. "
                "Per affrontare il problema, alcune amministrazioni hanno introdotto un biglietto d'ingresso nei giorni di maggiore affluenza. "
                "Secondo i critici, però, misure di questo tipo non bastano, se non si interviene anche sugli affitti brevi destinati ai turisti. "
                "Il vero obiettivo, sostengono, dovrebbe essere quello di rendere di nuovo possibile vivere in queste città, non solo visitarle."
            ),
            "questions": [
                (
                    "What risk does tourism bring, according to the text?",
                    ["historic centres made only for visitors", "pollution damaging monuments", "too few hotels"],
                    0,
                ),
                ("Why have many residents moved to the outskirts?", ["the centre is too noisy", "rents kept rising", "there is no public transport"], 1),
                (
                    "What have some city governments introduced?",
                    ["a ban on cruise ships", "free museums for residents", "an entry ticket on the busiest days"],
                    2,
                ),
                (
                    "What do the critics say the real goal should be?",
                    ["attracting more visitors", "making it possible to live in these cities again", "opening new shops"],
                    1,
                ),
            ],
        },
    },
    "ar": {
        "A1": {
            "title": "صباح أحمد",
            "text": (
                "في الصباح يذهب أحمد إلى السوق. يشتري خبزاً وماء. "
                "ثم يعود أحمد إلى البيت. في البيت يشرب شاياً."
            ),
            "questions": [
                ("Where does Ahmad go in the morning?", ["to school", "to the station", "to the market"], 2),
                ("What does Ahmad buy?", ["bread and water", "tea and milk", "a book"], 0),
                ("After the market, Ahmad goes ___.", ["to work", "home", "to the park"], 1),
                ("What does Ahmad drink at home?", ["water", "coffee", "tea"], 2),
            ],
        },
        "A2": {
            "title": "يوم في المدينة",
            "text": (
                "يوم الجمعة ذهبت سارة مع أبيها إلى المدينة بالحافلة. "
                "كانت الرحلة طويلة، فقرأت سارة كتاباً صغيراً. "
                "في المدينة زارت سارة وأبوها متحفاً كبيراً، ثم أكلت معه الغداء في مطعم قريب من الحديقة. "
                "اشترت سارة هدية لأمها، لأن عيد ميلادها كان يوم السبت. "
                "في المساء رجعت سارة وأبوها إلى البيت."
            ),
            "questions": [
                ("How did Sara and her father travel to the city?", ["by train", "by bus", "by car"], 1),
                ("What did Sara do on the long trip?", ["she read a small book", "she slept", "she talked with her father"], 0),
                (
                    "Why did Sara buy a present?",
                    ["a friend was ill", "she won a prize", "her mother's birthday was on Saturday"],
                    2,
                ),
                ("Where did they eat lunch?", ["at home", "in a restaurant near the park", "in the museum"], 1),
            ],
        },
        "B1": {
            "title": "تعلّم الطبخ",
            "text": (
                "لم أكن أعرف الطبخ عندما بدأت الدراسة في الجامعة. "
                "كنت آكل في المطاعم كل يوم، لكن ذلك كان مكلفاً وغير صحي. "
                "لذلك قررت أن أتعلم الطبخ من خلال مقاطع الفيديو على الإنترنت. "
                "في البداية كانت النتائج سيئة، وأحرقت الأرز أكثر من مرة. "
                "لكنني لم أستسلم، وبعد شهرين صرت أطبخ وجبات بسيطة بنفسي. "
                "الآن أدعو أصدقائي إلى العشاء مرة كل أسبوع، وأشعر بالفخر عندما يطلبون مني وصفة."
            ),
            "questions": [
                (
                    "Why did the writer decide to learn to cook?",
                    ["eating out was expensive and unhealthy", "a friend asked them to", "the university required it"],
                    0,
                ),
                ("How did the writer learn?", ["in a cooking class", "from videos online", "from their mother"], 1),
                ("What went wrong at first?", ["the oven broke", "they cut their hand", "they burned the rice more than once"], 2),
                ("How often does the writer invite friends to dinner now?", ["once a week", "every day", "once a month"], 0),
            ],
        },
        "B2": {
            "title": "القراءة في عصر الشاشات",
            "text": (
                "يرى كثير من الباحثين أن الهواتف الذكية غيّرت طريقة قراءتنا تغييراً عميقاً. "
                "فنحن نقضي ساعات يومياً في تصفح نصوص قصيرة، وننتقل بسرعة من موضوع إلى آخر، "
                "مما يضعف قدرتنا على التركيز في النصوص الطويلة. "
                "ومع ذلك، لا يعني هذا أن القراءة في طريقها إلى الاختفاء؛ "
                "إذ تشير بعض الدراسات إلى أن عدد الشباب الذين يشترون الكتب الورقية قد ارتفع في السنوات الأخيرة. "
                "ويفسّر بعضهم ذلك بأن الكتاب الورقي أصبح وسيلة للابتعاد عن الشاشات والتمتع بلحظات من الهدوء. "
                "والسؤال الذي يطرحه المختصون اليوم ليس ما إذا كنا سنقرأ، بل كيف سنحافظ على عادة القراءة العميقة."
            ),
            "questions": [
                (
                    "What do short texts on phones weaken, according to researchers?",
                    ["our eyesight", "our focus on long texts", "our memory for names"],
                    1,
                ),
                (
                    "What have some studies found about young people?",
                    ["more of them buy paper books", "they no longer read at all", "they prefer audiobooks"],
                    0,
                ),
                (
                    "Why has the paper book become attractive, according to some?",
                    ["it is cheaper than a phone", "schools require it", "it is a way to get away from screens"],
                    2,
                ),
                (
                    "What question do specialists ask today?",
                    ["whether we will read at all", "how to keep the habit of deep reading", "which phone is best for reading"],
                    1,
                ),
            ],
        },
    },
}


@dataclass(frozen=True)
class PlacementStep:
    """Where the ladder stands: either a final band, or the next passage to read."""

    level: str | None
    next_level: str | None
    correct: int
    total: int

    @property
    def done(self) -> bool:
        return self.level is not None


def _spec(language: str, level: str) -> dict:
    try:
        return _LADDER[language][level]
    except KeyError:
        raise ValueError("No placement passage for that language and level.") from None


def placement_read(language: str, level: str = "A1") -> PlacementRead:
    spec = _spec(language, level)
    questions = [
        PlacementQuestion(id=f"q{i + 1}", prompt=prompt, choices=list(choices))
        for i, (prompt, choices, _index) in enumerate(spec["questions"])
    ]
    return PlacementRead(
        language=language,  # type: ignore[arg-type]
        level=level,  # type: ignore[arg-type]
        title=spec["title"],
        text=spec["text"],
        questions=questions,
    )


def score_stage(language: str, level: str, answers: list[int]) -> int:
    keys = [item[2] for item in _spec(language, level)["questions"]]
    if len(answers) != len(keys):
        raise ValueError("Answer every question.")
    return sum(1 for got, want in zip(answers, keys) if got == want)


def next_step(language: str, start: str, stages: list[tuple[str, list[int]]]) -> PlacementStep:
    """Walk the ladder from `start` through the passages read so far.

    Raises ValueError when a stage is not the passage the ladder asked for, so a
    client cannot skip ahead to a higher band.
    """
    if start not in LEVELS:
        raise ValueError("Unknown starting level.")
    if not stages:
        raise ValueError("Answer every question.")
    idx = LEVELS.index(start)
    climbed = descended = False
    correct = total = 0
    for i, (level, answers) in enumerate(stages):
        if level != LEVELS[idx]:
            raise ValueError("Read the passages in order.")
        got = score_stage(language, level, answers)
        correct += got
        total += len(answers)
        last = i == len(stages) - 1
        if got >= PASS_MARK:
            if descended or idx == len(LEVELS) - 1:
                return _finish(last, level, correct, total)
            climbed = True
            idx += 1
        else:
            if climbed:
                return _finish(last, LEVELS[idx - 1], correct, total)
            if idx == 0:
                return _finish(last, "A1", correct, total)
            descended = True
            idx -= 1
    return PlacementStep(level=None, next_level=LEVELS[idx], correct=correct, total=total)


def _finish(last: bool, level: str, correct: int, total: int) -> PlacementStep:
    if not last:
        raise ValueError("Read the passages in order.")
    return PlacementStep(level=level, next_level=None, correct=correct, total=total)


def score_legacy(language: str, answers: list[int]) -> PlacementStep:
    """The one-passage form older clients still send: the A1 read alone.

    One easy passage cannot show more than A2, so a pass places at A2."""
    got = score_stage(language, "A1", answers)
    level = "A2" if got >= PASS_MARK else "A1"
    return PlacementStep(level=level, next_level=None, correct=got, total=len(answers))
