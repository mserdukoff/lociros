from __future__ import annotations

"""Precomputed Japanese catalog: hand-written A1–B2 texts plus multi-chapter series."""

from sqlalchemy.orm import Session

from app.models.db import PassageRow, SessionLocal
from app.services.generate import save_authored_passage
from app.services.learner import calibration_passed

# People / places / foods used only with A1 です・ます patterns.
PEOPLE = [
    ("私", "I"),
    ("母", "Mother"),
    ("父", "Father"),
    ("友達", "A friend"),
    ("先生", "The teacher"),
    ("姉", "Older sister"),
    ("弟", "Younger brother"),
]
PLACES = [
    ("家", "home"),
    ("学校", "school"),
    ("駅", "the station"),
    ("店", "the shop"),
    ("公園", "the park"),
    ("図書館", "the library"),
    ("病院", "the hospital"),
]
FOODS = [
    ("パン", "bread"),
    ("ご飯", "rice"),
    ("りんご", "an apple"),
    ("水", "water"),
    ("お茶", "tea"),
    ("魚", "fish"),
    ("肉", "meat"),
]
THINGS = [
    ("本", "a book"),
    ("ペン", "a pen"),
    ("傘", "an umbrella"),
    ("鞄", "a bag"),
    ("時計", "a clock"),
    ("写真", "a photo"),
]
DAYS = ["今日", "明日"]
DAY_EN = {"今日": "Today", "明日": "Tomorrow"}
ADJ = [
    ("新しい", "new"),
    ("古い", "old"),
    ("いい", "good"),
    ("美味しい", "delicious"),
    ("きれい", "clean"),
    ("大きい", "big"),
    ("小さい", "small"),
]


def _en(*sentences: str) -> str:
    """Join English sentences so the reader can align them 1:1 with Japanese."""
    out: list[str] = []
    for s in sentences:
        s = " ".join(str(s).split())
        if s and s[-1] not in ".!?":
            s += "."
        if s:
            out.append(s)
    return " ".join(out)


def _bare(noun: str) -> str:
    n = noun.strip()
    lower = n.lower()
    for prefix in ("an ", "a ", "the "):
        if lower.startswith(prefix):
            return n[len(prefix) :]
    return n


def _place_subj(pl_en: str) -> str:
    if pl_en == "home":
        return "Home"
    if pl_en.startswith("the "):
        return pl_en[0].upper() + pl_en[1:]
    return f"The {pl_en}"


def _a1(title: str, topic: str, text: str, en: str, genre: str = "daily_life") -> dict:
    return {
        "language": "ja",
        "level": "A1",
        "topic": topic,
        "genre": genre,
        "title": title,
        "text": text,
        "translation": en,
    }


def _a2(title: str, topic: str, text: str, en: str, genre: str = "daily_life", **extra) -> dict:
    item = {
        "language": "ja",
        "level": "A2",
        "topic": topic,
        "genre": genre,
        "title": title,
        "text": text,
        "translation": en,
    }
    item.update(extra)
    return item


def _b1(title: str, topic: str, text: str, en: str, genre: str = "daily_life", **extra) -> dict:
    item = {
        "language": "ja",
        "level": "B1",
        "topic": topic,
        "genre": genre,
        "title": title,
        "text": text,
        "translation": en,
    }
    item.update(extra)
    return item


def _b2(title: str, topic: str, text: str, en: str, genre: str = "news") -> dict:
    return {
        "language": "ja",
        "level": "B2",
        "topic": topic,
        "genre": genre,
        "title": title,
        "text": text,
        "translation": en,
    }


def _a1_bank() -> list[dict]:
    # One passage per template: swapping nouns into the same frame reads as a duplicate.
    person, p_en = PEOPLE[0]
    place, pl_en = PLACES[0]
    food, f_en = FOODS[0]
    thing, t_en = THINGS[0]
    adj, a_en = ADJ[0]
    day = DAYS[0]
    text = (
        f"{person}は学生です。{day}は休みです。"
        f"{person}は{place}にいます。ここは{place}です。"
        f"これは{food}です。{food}は{adj}です。"
        f"{person}は{food}を食べます。水を飲みます。"
        f"それは{thing}です。{thing}はここです。"
        f"{person}は本を読みます。本は{adj}です。"
        f"母は家にいます。母は元気です。"
        f"今日はいいです。{place}はきれいです。"
    )
    en = _en(
        f"{p_en} is a student",
        f"{DAY_EN[day]} is a day off",
        f"{p_en} is at {pl_en}",
        f"This is {pl_en}",
        f"This is {f_en}",
        f"The {_bare(f_en)} is {a_en}",
        f"{p_en} eats {f_en}",
        f"{p_en} drinks water",
        f"That is {t_en}",
        f"The {_bare(t_en)} is here",
        f"{p_en} reads a book",
        f"The book is {a_en}",
        "Mother is at home",
        "Mother is well",
        "Today is good",
        f"{_place_subj(pl_en)} is clean",
    )
    return [_a1(f"{person}と{place}", f"{p_en.lower()} at {pl_en}", text, en)]


def _a2_bank() -> list[dict]:
    scenes = [
        (
            "駅で切符",
            "buying a ticket",
            "travel",
            "昨日、私は駅へ行きました。切符を買いました。電車は八時です。友達は改札の前にいます。少し待ちました。友達は来ました。二人は京都へ行きます。京都はきれいです。写真を撮りました。お茶を飲みました。駅のパンは美味しかったです。六時に家へ帰りました。母は家にいました。今日の話をしました。",
            _en(
                "Yesterday I went to the station",
                "I bought a ticket",
                "The train is at eight",
                "A friend is in front of the ticket gate",
                "I waited a little",
                "My friend came",
                "The two of us go to Kyoto",
                "Kyoto is beautiful",
                "I took photos",
                "I drank tea",
                "The bread at the station was delicious",
                "I went home at six",
                "Mother was at home",
                "I talked about today",
            ),
        ),
        (
            "市場の朝",
            "morning market",
            "daily_life",
            "朝、母と市場へ行きました。りんごを五つ買いました。魚も買いました。店員は親切でした。水をくださいと言いました。袋を持って、家へ帰りました。父はキッチンにいました。りんごは甘かったです。私はテーブルを拭きました。今日はいい朝でした。",
            _en(
                "In the morning I went to the market with my mother",
                "I bought five apples",
                "I also bought fish",
                "The clerk was kind",
                "I said please give me water",
                "I carried a bag and went home",
                "Father was in the kitchen",
                "The apples were sweet",
                "I wiped the table",
                "Today was a good morning",
            ),
        ),
        (
            "図書館の午後",
            "afternoon at the library",
            "daily_life",
            "午後、私は図書館へ行きました。本を借りました。静かな部屋で日本語を勉強しました。辞書を使いました。わからない言葉を書きました。五時に図書館は終わりです。自転車で家へ帰りました。姉は部屋にいました。本を見せました。夜、もう一度読みました。",
            _en(
                "In the afternoon I went to the library",
                "I borrowed a book",
                "I studied Japanese in a quiet room",
                "I used a dictionary",
                "I wrote down words I did not understand",
                "The library closes at five",
                "I went home by bicycle",
                "Older sister was in the room",
                "I showed the book",
                "At night I read it again",
            ),
        ),
        (
            "雨の日",
            "a rainy day",
            "daily_life",
            "今朝は雨でした。傘を持って学校へ行きました。靴は少し濡れました。教室は暖かかったです。先生は地図を見せました。日本の川の名前を書きました。昼、弁当を食べました。雨は止まりました。友達と公園へ行きました。地面はまだ濡れました。すぐに家へ帰りました。",
            _en(
                "It rained this morning",
                "I took an umbrella and went to school",
                "My shoes got a little wet",
                "The classroom was warm",
                "The teacher showed a map",
                "I wrote the names of rivers in Japan",
                "At noon I ate a boxed lunch",
                "The rain stopped",
                "I went to the park with a friend",
                "The ground was still wet",
                "I went home right away",
            ),
        ),
        (
            "新しい靴",
            "new shoes",
            "daily_life",
            "土曜日、姉と店へ行きました。黒い靴を見ました。サイズはちょうどよかったです。姉は赤い靴を買いました。私は黒い靴を買いました。お金を払いました。袋を持って駅へ行きました。電車は混みました。家で靴を履きました。父はいいねと言いました。",
            _en(
                "On Saturday I went to a shop with my older sister",
                "I looked at black shoes",
                "The size was just right",
                "Older sister bought red shoes",
                "I bought black shoes",
                "I paid",
                "I carried a bag and went to the station",
                "The train was crowded",
                "At home I put on the shoes",
                "Father said they looked good",
            ),
        ),
        (
            "病院",
            "at the hospital",
            "daily_life",
            "弟は熱がありました。母と病院へ行きました。名前を書きました。少し待ちました。医者は優しかったです。薬をもらいました。水をたくさん飲んでくださいと言いました。家へ帰りました。弟はベッドにいます。私は水を持って行きました。夜は静かでした。",
            _en(
                "Younger brother had a fever",
                "I went to the hospital with my mother",
                "I wrote a name",
                "I waited a little",
                "The doctor was kind",
                "We received medicine",
                "The doctor said please drink a lot of water",
                "We went home",
                "Younger brother is in bed",
                "I brought water",
                "The night was quiet",
            ),
        ),
        (
            "空港",
            "at the airport",
            "travel",
            "先月、父と空港へ行きました。切符とパスポートを見せました。荷物を出しました。飛行機は十時です。水を買いました。窓の席に座りました。雲を見ました。大阪に着きました。駅までバスに乗りました。ホテルは駅の近くです。",
            _en(
                "Last month I went to the airport with my father",
                "We showed tickets and passports",
                "We checked the bags",
                "The plane is at ten",
                "I bought water",
                "I sat in a window seat",
                "I looked at the clouds",
                "We arrived in Osaka",
                "We took a bus to the station",
                "The hotel is near the station",
            ),
        ),
        (
            "手紙",
            "a letter",
            "daily_life",
            "昨日、友達に手紙を書きました。切手を買いました。郵便局へ行きました。手紙を出しました。友達は北海道にいます。冬は寒いです。写真も入れました。家の猫の写真です。帰りにパンを買いました。夜、母とお茶を飲みました。",
            _en(
                "Yesterday I wrote a letter to a friend",
                "I bought a stamp",
                "I went to the post office",
                "I mailed the letter",
                "My friend is in Hokkaido",
                "Winter is cold",
                "I also put in a photo",
                "It is a photo of the cat at home",
                "On the way home I bought bread",
                "At night I drank tea with my mother",
            ),
        ),
        (
            "料理",
            "cooking dinner",
            "daily_life",
            "夕方、私はご飯を作りました。野菜を切りました。魚を焼きました。母は皿を出しました。父はテーブルを準備しました。みんなで食べました。味はよかったです。後で皿を洗いました。キッチンはきれいです。明日も作ります。",
            _en(
                "In the evening I cooked rice",
                "I cut vegetables",
                "I grilled fish",
                "Mother put out plates",
                "Father set the table",
                "Everyone ate together",
                "The taste was good",
                "Afterwards I washed the plates",
                "The kitchen is clean",
                "I will cook again tomorrow",
            ),
        ),
        (
            "映画",
            "going to a movie",
            "daily_life",
            "金曜日、友達と映画を見ました。切符を買いました。ポップコーンも買いました。映画は八時に始まりました。面白かったです。後でカフェへ行きました。コーヒーを飲みました。話をたくさんしました。十時に家へ帰りました。楽しかったです。",
            _en(
                "On Friday I saw a movie with a friend",
                "I bought a ticket",
                "I also bought popcorn",
                "The movie started at eight",
                "It was interesting",
                "Afterwards we went to a cafe",
                "We drank coffee",
                "We talked a lot",
                "I went home at ten",
                "It was fun",
            ),
        ),
    ]
    items: list[dict] = []
    for title, topic, genre, text, en in scenes:
        items.append(_a2(title, topic, text, en, genre))
    items.append(
        _a2(
            "川の近くの午後",
            "walked near the river",
            "午後、私は川の近くを歩きました。それからパンを食べました。"
            "水を飲みました。少し休みました。本を読みました。"
            "六時に家へ帰りました。母はキッチンにいました。"
            "今日の話をしました。夜、お茶を飲みました。早く寝ました。",
            _en(
                "In the afternoon I walked near the river",
                "Then I ate bread",
                "I drank water",
                "I rested a little",
                "I read a book",
                "I went home at six",
                "Mother was in the kitchen",
                "I talked about today",
                "At night I drank tea",
                "I went to bed early",
            ),
        )
    )
    return items


def _b1_bank() -> list[dict]:
    stories = [
        (
            "電車の中",
            "on the train",
            "毎朝、私は七時の電車に乗っています。窓の外を見ていると、川が見えます。隣の人は本を読んでいます。もし席が空いていたら、座ります。今日は友達が駅で待っています。一緒に会社へ行く予定です。電車が遅れているので、少し急いでいます。",
            _en(
                "Every morning I take the seven o'clock train",
                "When I look out the window, I can see a river",
                "The person next to me is reading a book",
                "If a seat is free, I sit",
                "Today a friend is waiting at the station",
                "We plan to go to the company together",
                "The train is late, so I am in a bit of a hurry",
            ),
        ),
        (
            "新しいクラス",
            "a new class",
            "来月から新しい日本語のクラスが始まります。先生はゆっくり話してくれます。わからない言葉があったら、質問しています。宿題は毎日あります。終わったら、カフェで復習しています。話せば話すほど、自信が出てきます。",
            _en(
                "A new Japanese class starts next month",
                "The teacher speaks slowly for us",
                "If there is a word I do not understand, I ask",
                "There is homework every day",
                "When I finish, I review at a cafe",
                "The more I speak, the more confidence I have",
            ),
        ),
        (
            "引っ越し",
            "moving house",
            "来週、私は新しいアパートに引っ越します。今の部屋は駅から遠いです。友達が手伝ってくれると言っています。箱を準備しているところです。引っ越したら、近所の店を探します。静かな町なので、夜は本が読めます。",
            _en(
                "Next week I will move to a new apartment",
                "My current room is far from the station",
                "A friend says they will help",
                "I am preparing boxes",
                "After I move, I will look for nearby shops",
                "It is a quiet town, so I can read at night",
            ),
        ),
        (
            "忘れもの",
            "a forgotten bag",
            "昨日、電車の中に鞄を忘れてしまいました。気がついたときは、もう次の駅に着いていました。駅員に話したら、すぐに探してくれました。鞄は事務所にありました。助かりました。これから気をつけます。",
            _en(
                "Yesterday I left my bag on the train",
                "When I noticed, I had already arrived at the next station",
                "When I told a station worker, they looked for it right away",
                "The bag was in the office",
                "That was a relief",
                "From now on I will be careful",
            ),
        ),
        (
            "海の天気",
            "weather by the sea",
            "週末は海へ行くつもりです。波が高くなったら、泳ぎません。朝早く出れば、道は空いています。弁当を作っています。風が強かったら、写真だけ撮ります。帰れそうだったら、夕方の電車に乗ります。",
            _en(
                "This weekend I plan to go to the sea",
                "If the waves get high, I will not swim",
                "If I leave early in the morning, the roads are empty",
                "I am making a boxed lunch",
                "If the wind is strong, I will only take photos",
                "If it looks like I can get back, I will take the evening train",
            ),
        ),
    ]
    items = [_b1(t, topic, text, en, "daily_life") for t, topic, text, en in stories]
    items.append(
        _b1(
            "図書館の日記",
            "journal",
            "今日はいい天気です。図書館で調べています。資料を読めば、答えがわかります。"
            "終わったら報告します。夕方、母と話しています。もし時間があったら、明日も続けます。"
            "夜は早く寝ます。朝が早いからです。",
            _en(
                "Today the weather is good",
                "I am looking things up at the library",
                "If I read the materials, I will understand the answer",
                "When I finish, I will report",
                "In the evening I am talking with my mother",
                "If I have time, I will continue tomorrow too",
                "I go to bed early at night",
                "That is because morning is early",
            ),
            "daily_life",
        )
    )
    return items


def _b2_bank() -> list[dict]:
    articles = [
        (
            "地域の図書館",
            "community libraries",
            "近年、小さな町でも図書館の役割が変わってきている。本が読まれるだけでなく、仕事の場所としても使われている。夜遅くまで開いている館もあり、学生に感謝されている。一方で、予算が削られると、司書の数が減ってしまう。住民が声を上げなければ、サービスは守れないだろう。",
            _en(
                "In recent years, the role of libraries has been changing even in small towns",
                "They are used not only for reading books but also as places to work",
                "Some libraries stay open late, and students are grateful",
                "On the other hand, if budgets are cut, the number of librarians falls",
                "Unless residents speak up, the service will not be protected",
            ),
        ),
        (
            "電車の遅延",
            "train delays",
            "今朝、首都圏の電車が大きく遅れた。強風の影響だと発表された。乗客は駅で待たされ、会社に連絡する人が多かった。鉄道会社は、今後同じ問題が起きたときに情報を早く出すと説明している。便利な交通は、正確な案内があって初めて信頼される。",
            _en(
                "This morning trains in the capital region were badly delayed",
                "It was announced that strong wind was the cause",
                "Passengers were made to wait at the station, and many people contacted work",
                "The railway company says it will put out information faster if the same problem happens again",
                "Convenient transit is trusted only when the information is accurate",
            ),
        ),
        (
            "食の選択",
            "food choices",
            "スーパーでは、地元の野菜が少し高く売られている。輸入の品の方が安い場合もある。しかし、運ばれる距離が短い食品は、環境への負担が軽いと考えられている。消費者がどちらを選ぶかによって、農家の未来も変わる。説明が店に書かれていれば、判断しやすい。",
            _en(
                "At the supermarket, local vegetables are sold a little more expensively",
                "Imported goods are sometimes cheaper",
                "However, food that travels a short distance is thought to be easier on the environment",
                "Farmers' futures also change depending on which one consumers choose",
                "If an explanation is written in the store, it is easier to decide",
            ),
        ),
    ]
    items = [_b2(t, topic, text, en) for t, topic, text, en in articles]
    items.append(
        _b2(
            "新しい規則",
            "a local rule",
            "新しい規則が来月から導入される。説明会が開かれ、質問も受け付けられた。"
            "反対する人もいれば、支持する人もいる。最終的な判断は、公開された資料を読んでから下されるべきだ。"
            "町の未来は、静かな議論の中で決まっていく。",
            _en(
                "A new rule will be introduced next month",
                "An information meeting was held, and questions were also accepted",
                "Some people oppose it, and some people support it",
                "The final decision should be made after reading the published materials",
                "The town's future is decided through quiet discussion",
            ),
        )
    )
    return items


def _series() -> list[dict]:
    ch1 = _a2(
        "駅の朝 一",
        "station morning chapter 1",
        "私の名前は山田です。毎朝、七時に家を出ます。駅まで歩きます。改札で切符を見せます。ホームは静かです。電車を待ちました。隣の人は新聞を読みました。今日は友達の田中に会います。田中は切符売り場の前にいます。二人は大阪へ行きます。",
        _en(
            "My name is Yamada",
            "Every morning I leave home at seven",
            "I walk to the station",
            "I show my ticket at the gate",
            "The platform is quiet",
            "I waited for the train",
            "The person next to me read a newspaper",
            "Today I will meet my friend Tanaka",
            "Tanaka is in front of the ticket window",
            "The two of us go to Osaka",
        ),
        "travel",
        series_id="eki-asa",
        chapter_index=1,
    )
    ch2 = _a2(
        "駅の朝 二",
        "station morning chapter 2",
        "電車に乗りました。窓の外は川です。田中は弁当を持ってきました。私はお茶を買いました。二人は話をしました。大阪の地図を見ました。駅に着きました。出口は右です。少し歩きました。川の近くの店へ入りました。パンを買いました。",
        _en(
            "We boarded the train",
            "Outside the window is a river",
            "Tanaka brought a boxed lunch",
            "I bought tea",
            "The two of us talked",
            "We looked at a map of Osaka",
            "We arrived at the station",
            "The exit is on the right",
            "We walked a little",
            "We went into a shop near the river",
            "We bought bread",
        ),
        "travel",
        series_id="eki-asa",
        chapter_index=2,
    )
    ch3 = _a2(
        "駅の朝 三",
        "station morning chapter 3",
        "午後、城を見ました。写真をたくさん撮りました。足が少し疲れました。カフェで休みました。コーヒーは熱かったです。田中はお土産を買いました。私は葉書を書きました。母に出します。夕方の電車は混みました。席を見つけました。",
        _en(
            "In the afternoon we saw a castle",
            "We took a lot of photos",
            "Our feet got a little tired",
            "We rested at a cafe",
            "The coffee was hot",
            "Tanaka bought a souvenir",
            "I wrote a postcard",
            "I will send it to my mother",
            "The evening train was crowded",
            "We found seats",
        ),
        "travel",
        series_id="eki-asa",
        chapter_index=3,
    )
    ch4 = _a2(
        "駅の朝 四",
        "station morning chapter 4",
        "家の駅に着きました。母は改札の外にいました。今日の話をしました。田中は別の電車に乗りました。私は歩いて家へ帰りました。靴を脱ぎました。お茶を飲みました。明日も早く起きます。でも今日は楽しかったです。",
        _en(
            "We arrived at my home station",
            "Mother was outside the ticket gate",
            "I talked about today",
            "Tanaka took another train",
            "I walked home",
            "I took off my shoes",
            "I drank tea",
            "I will get up early tomorrow too",
            "But today was fun",
        ),
        "travel",
        series_id="eki-asa",
        chapter_index=4,
    )
    w1 = _b1(
        "海の町 一",
        "seaside town 1",
        "私は夏の間、叔母の家に泊まっています。町は小さくて、朝から魚の匂いがしています。港まで歩けば、十分です。漁師の人たちが網を直しています。もし天気がよかったら、午後は泳ごうと思っています。",
        _en(
            "I am staying at my aunt's house for the summer",
            "The town is small, and it smells of fish from the morning",
            "If I walk to the harbor, that is enough",
            "The fishers are repairing nets",
            "If the weather is good, I am thinking of swimming in the afternoon",
        ),
        "travel",
        series_id="umi-machi",
        chapter_index=1,
    )
    w2 = _b1(
        "海の町 二",
        "seaside town 2",
        "昨日は風が強かったので、泳ぎませんでした。代わりに市場を歩いて、叔母の買い物を手伝いました。知らない言葉を聞いたら、メモしています。夜、日記を書いていると、波の音がよく聞こえます。ここに慣れてきました。",
        _en(
            "Yesterday the wind was strong, so I did not swim",
            "Instead I walked through the market and helped with my aunt's shopping",
            "If I hear a word I do not know, I write it down",
            "At night, when I am writing in my diary, I can hear the sound of the waves well",
            "I have gotten used to being here",
        ),
        "travel",
        series_id="umi-machi",
        chapter_index=2,
    )
    w3 = _b1(
        "海の町 三",
        "seaside town 3",
        "今朝、船に乗せてくれました。遠くに島が見えています。戻ったら、魚をさばくところを見せてもらいました。簡単ではなかったですが、面白かったです。来年も来られたら、もっと手伝いたいです。",
        _en(
            "This morning they let me on a boat",
            "An island is visible in the distance",
            "After we returned, they showed me how they prepare the fish",
            "It was not easy, but it was interesting",
            "If I can come next year too, I want to help more",
        ),
        "travel",
        series_id="umi-machi",
        chapter_index=3,
    )
    j1 = _a2(
        "新しい仕事 一",
        "new job 1",
        "四月から新しい仕事です。朝は八時に会社へ行きます。名前は佐藤です。机は窓の近くです。先輩は山田さんです。パソコンの使い方を習いました。お茶を入れました。お昼は近くの店です。緊張しました。でもみんな親切です。",
        _en(
            "From April it is a new job",
            "In the morning I go to the company at eight",
            "My name is Sato",
            "The desk is near the window",
            "My senior colleague is Yamada",
            "I learned how to use the computer",
            "I made tea",
            "Lunch is at a nearby shop",
            "I was nervous",
            "But everyone is kind",
        ),
        "work",
        series_id="atarashii-shigoto",
        chapter_index=1,
    )
    j2 = _a2(
        "新しい仕事 二",
        "new job 2",
        "今日は会議がありました。資料をコピーしました。山田さんは前で話しました。私はメモを書きました。わからない言葉がありました。後で聞きました。山田さんはゆっくり説明しました。五時に仕事が終わりました。駅まで歩きました。",
        _en(
            "Today there was a meeting",
            "I copied the papers",
            "Yamada spoke at the front",
            "I wrote notes",
            "There was a word I did not understand",
            "I asked later",
            "Yamada explained slowly",
            "Work finished at five",
            "I walked to the station",
        ),
        "work",
        series_id="atarashii-shigoto",
        chapter_index=2,
    )
    j3 = _a2(
        "新しい仕事 三",
        "new job 3",
        "金曜日、初めて一人で電話を受けました。名前を聞きました。メモを残しました。山田さんはいい仕事だと言いました。夕方、同僚とお茶を飲みました。来週は新しい仕事があります。少し不安です。でも毎日勉強します。",
        _en(
            "On Friday I answered the phone alone for the first time",
            "I asked for a name",
            "I left a note",
            "Yamada said it was good work",
            "In the evening I drank tea with a colleague",
            "Next week there is new work",
            "I am a little nervous",
            "But I study every day",
        ),
        "work",
        series_id="atarashii-shigoto",
        chapter_index=3,
    )
    return [ch1, ch2, ch3, ch4, w1, w2, w3, j1, j2, j3]


def default_comprehension(item: dict) -> list[dict]:
    from app.services.comprehension import questions_from_english

    built = questions_from_english(item.get("translation") or "", item.get("topic") or "")
    if built:
        return built
    topic = item.get("topic") or item["title"]
    return [
        {
            "id": "q1",
            "prompt": "What is this passage about?",
            "choices": [topic, "a train timetable", "a recipe"],
            "answer_index": 0,
        }
    ]


def catalog_items() -> list[dict]:
    items = _a1_bank() + _a2_bank() + _b1_bank() + _b2_bank() + _series()
    # Deduplicate by title; keep first
    seen: set[str] = set()
    unique: list[dict] = []
    for item in items:
        if item["title"] in seen:
            continue
        seen.add(item["title"])
        unique.append(item)
    return unique


def seed_catalog(db: Session | None = None) -> int:
    close = False
    if db is None:
        db = SessionLocal()
        close = True
    existing = {row.title: row for row in db.query(PassageRow).filter(PassageRow.language == "ja")}
    added = 0
    try:
        import json

        for item in catalog_items():
            row = existing.get(item["title"])
            if row is not None and calibration_passed(row):
                changed = False
                if item.get("series_id") and not getattr(row, "series_id", None):
                    row.series_id = item["series_id"]
                    row.chapter_index = item.get("chapter_index")
                    changed = True
                from app.services.comprehension import stale_comprehension

                if stale_comprehension(getattr(row, "comprehension_json", None)):
                    row.comprehension_json = json.dumps(
                        default_comprehension(item), ensure_ascii=False
                    )
                    changed = True
                new_en = item.get("translation")
                if (
                    new_en
                    and row.text == item["text"]
                    and getattr(row, "translation", None) != new_en
                ):
                    row.translation = new_en
                    changed = True
                if changed:
                    db.commit()
                continue
            if row is not None:
                db.delete(row)
                db.commit()
            saved = save_authored_passage(
                db,
                language="ja",
                level=item["level"],
                topic=item["topic"],
                genre=item.get("genre"),
                title=item["title"],
                text=item["text"],
                translation=item.get("translation"),
                series_id=item.get("series_id"),
                chapter_index=item.get("chapter_index"),
            )
            saved.comprehension_json = json.dumps(default_comprehension(item))
            db.commit()
            existing[item["title"]] = saved
            added += 1
    finally:
        if close:
            db.close()
    return added
