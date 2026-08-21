-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Kana learning track, phase 1: reference tables (hiragana, katakana) plus their
-- per-user SRS progress tables, mirroring kanji/vocabulary's shape exactly --
-- same SRS columns as user_vocabulary_progress, same status/status_before checks,
-- same RLS style as kanji/vocabulary (public.kanji_vocabulary_rls) and
-- user_vocabulary_progress ("Users manage own ..." + account_is_active()).
--
-- Unlike kanji, a kana character has exactly one testable property (its
-- pronunciation), so there's no separate meaning/reading split -- one progress
-- table per set, keyed by the character's row in the reference table. sort_order
-- encodes classic textbook gojuon order (base rows, then dakuten/handakuten,
-- then yoon combinations last) -- introduce_hiragana/introduce_katakana's
-- candidate RPCs (phase 2) order by this instead of id.

create table public.hiragana (
  id bigint generated always as identity primary key,
  character text not null,
  romaji text not null,
  gojuon_row text not null,
  sort_order integer not null unique
);

create table public.katakana (
  id bigint generated always as identity primary key,
  character text not null,
  romaji text not null,
  gojuon_row text not null,
  sort_order integer not null unique
);

create table public.user_hiragana_progress (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  hiragana_id bigint not null references public.hiragana(id) on delete cascade,
  status text not null default 'new'
    check (status = any (array['new', 'learning', 'review', 'relearning', 'suspended'])),
  status_before text null
    check (status_before is null or status_before = any (array['new', 'learning', 'review', 'relearning'])),
  ease_factor numeric not null default 2.5,
  interval_days integer not null default 0,
  repetitions integer not null default 0,
  lapses integer not null default 0,
  learning_step integer not null default 0,
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz null,
  session_id bigint null references public.study_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, hiragana_id)
);

create table public.user_katakana_progress (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  katakana_id bigint not null references public.katakana(id) on delete cascade,
  status text not null default 'new'
    check (status = any (array['new', 'learning', 'review', 'relearning', 'suspended'])),
  status_before text null
    check (status_before is null or status_before = any (array['new', 'learning', 'review', 'relearning'])),
  ease_factor numeric not null default 2.5,
  interval_days integer not null default 0,
  repetitions integer not null default 0,
  lapses integer not null default 0,
  learning_step integer not null default 0,
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz null,
  session_id bigint null references public.study_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, katakana_id)
);

create index idx_uhp_user_due on public.user_hiragana_progress using btree (user_id, due_at);
create index idx_uhp_created_at on public.user_hiragana_progress using btree (created_at);
create index idx_uhp_session on public.user_hiragana_progress using btree (session_id);

create index idx_ukp_user_due on public.user_katakana_progress using btree (user_id, due_at);
create index idx_ukp_created_at on public.user_katakana_progress using btree (created_at);
create index idx_ukp_session on public.user_katakana_progress using btree (session_id);

create trigger set_updated_at_trigger
  before update on public.user_hiragana_progress
  for each row execute function set_updated_at();

create trigger set_updated_at_trigger
  before update on public.user_katakana_progress
  for each row execute function set_updated_at();

alter table public.hiragana enable row level security;
alter table public.katakana enable row level security;
alter table public.user_hiragana_progress enable row level security;
alter table public.user_katakana_progress enable row level security;

create policy "Authenticated users can read hiragana" on public.hiragana
  for select
  to authenticated
  using (true);

create policy "Authenticated users can read katakana" on public.katakana
  for select
  to authenticated
  using (true);

create policy "Users manage own user_hiragana_progress" on public.user_hiragana_progress
  using (((select auth.uid()) = user_id) and account_is_active(user_id))
  with check (((select auth.uid()) = user_id) and account_is_active(user_id));

create policy "Users manage own user_katakana_progress" on public.user_katakana_progress
  using (((select auth.uid()) = user_id) and account_is_active(user_id))
  with check (((select auth.uid()) = user_id) and account_is_active(user_id));

insert into public.hiragana (character, romaji, gojuon_row, sort_order) values
  ('あ', 'a', 'a', 1),
  ('い', 'i', 'a', 2),
  ('う', 'u', 'a', 3),
  ('え', 'e', 'a', 4),
  ('お', 'o', 'a', 5),
  ('か', 'ka', 'ka', 6),
  ('き', 'ki', 'ka', 7),
  ('く', 'ku', 'ka', 8),
  ('け', 'ke', 'ka', 9),
  ('こ', 'ko', 'ka', 10),
  ('さ', 'sa', 'sa', 11),
  ('し', 'shi', 'sa', 12),
  ('す', 'su', 'sa', 13),
  ('せ', 'se', 'sa', 14),
  ('そ', 'so', 'sa', 15),
  ('た', 'ta', 'ta', 16),
  ('ち', 'chi', 'ta', 17),
  ('つ', 'tsu', 'ta', 18),
  ('て', 'te', 'ta', 19),
  ('と', 'to', 'ta', 20),
  ('な', 'na', 'na', 21),
  ('に', 'ni', 'na', 22),
  ('ぬ', 'nu', 'na', 23),
  ('ね', 'ne', 'na', 24),
  ('の', 'no', 'na', 25),
  ('は', 'ha', 'ha', 26),
  ('ひ', 'hi', 'ha', 27),
  ('ふ', 'fu', 'ha', 28),
  ('へ', 'he', 'ha', 29),
  ('ほ', 'ho', 'ha', 30),
  ('ま', 'ma', 'ma', 31),
  ('み', 'mi', 'ma', 32),
  ('む', 'mu', 'ma', 33),
  ('め', 'me', 'ma', 34),
  ('も', 'mo', 'ma', 35),
  ('や', 'ya', 'ya', 36),
  ('ゆ', 'yu', 'ya', 37),
  ('よ', 'yo', 'ya', 38),
  ('ら', 'ra', 'ra', 39),
  ('り', 'ri', 'ra', 40),
  ('る', 'ru', 'ra', 41),
  ('れ', 're', 'ra', 42),
  ('ろ', 'ro', 'ra', 43),
  ('わ', 'wa', 'wa', 44),
  ('を', 'wo', 'wa', 45),
  ('ん', 'n', 'n', 46),
  ('が', 'ga', 'ga', 47),
  ('ぎ', 'gi', 'ga', 48),
  ('ぐ', 'gu', 'ga', 49),
  ('げ', 'ge', 'ga', 50),
  ('ご', 'go', 'ga', 51),
  ('ざ', 'za', 'za', 52),
  ('じ', 'ji', 'za', 53),
  ('ず', 'zu', 'za', 54),
  ('ぜ', 'ze', 'za', 55),
  ('ぞ', 'zo', 'za', 56),
  ('だ', 'da', 'da', 57),
  ('ぢ', 'ji', 'da', 58),
  ('づ', 'zu', 'da', 59),
  ('で', 'de', 'da', 60),
  ('ど', 'do', 'da', 61),
  ('ば', 'ba', 'ba', 62),
  ('び', 'bi', 'ba', 63),
  ('ぶ', 'bu', 'ba', 64),
  ('べ', 'be', 'ba', 65),
  ('ぼ', 'bo', 'ba', 66),
  ('ぱ', 'pa', 'pa', 67),
  ('ぴ', 'pi', 'pa', 68),
  ('ぷ', 'pu', 'pa', 69),
  ('ぺ', 'pe', 'pa', 70),
  ('ぽ', 'po', 'pa', 71),
  ('きゃ', 'kya', 'kya', 72),
  ('きゅ', 'kyu', 'kya', 73),
  ('きょ', 'kyo', 'kya', 74),
  ('しゃ', 'sha', 'sha', 75),
  ('しゅ', 'shu', 'sha', 76),
  ('しょ', 'sho', 'sha', 77),
  ('ちゃ', 'cha', 'cha', 78),
  ('ちゅ', 'chu', 'cha', 79),
  ('ちょ', 'cho', 'cha', 80),
  ('にゃ', 'nya', 'nya', 81),
  ('にゅ', 'nyu', 'nya', 82),
  ('にょ', 'nyo', 'nya', 83),
  ('ひゃ', 'hya', 'hya', 84),
  ('ひゅ', 'hyu', 'hya', 85),
  ('ひょ', 'hyo', 'hya', 86),
  ('みゃ', 'mya', 'mya', 87),
  ('みゅ', 'myu', 'mya', 88),
  ('みょ', 'myo', 'mya', 89),
  ('りゃ', 'rya', 'rya', 90),
  ('りゅ', 'ryu', 'rya', 91),
  ('りょ', 'ryo', 'rya', 92),
  ('ぎゃ', 'gya', 'gya', 93),
  ('ぎゅ', 'gyu', 'gya', 94),
  ('ぎょ', 'gyo', 'gya', 95),
  ('じゃ', 'ja', 'ja', 96),
  ('じゅ', 'ju', 'ja', 97),
  ('じょ', 'jo', 'ja', 98),
  ('びゃ', 'bya', 'bya', 99),
  ('びゅ', 'byu', 'bya', 100),
  ('びょ', 'byo', 'bya', 101),
  ('ぴゃ', 'pya', 'pya', 102),
  ('ぴゅ', 'pyu', 'pya', 103),
  ('ぴょ', 'pyo', 'pya', 104);

insert into public.katakana (character, romaji, gojuon_row, sort_order) values
  ('ア', 'a', 'a', 1),
  ('イ', 'i', 'a', 2),
  ('ウ', 'u', 'a', 3),
  ('エ', 'e', 'a', 4),
  ('オ', 'o', 'a', 5),
  ('カ', 'ka', 'ka', 6),
  ('キ', 'ki', 'ka', 7),
  ('ク', 'ku', 'ka', 8),
  ('ケ', 'ke', 'ka', 9),
  ('コ', 'ko', 'ka', 10),
  ('サ', 'sa', 'sa', 11),
  ('シ', 'shi', 'sa', 12),
  ('ス', 'su', 'sa', 13),
  ('セ', 'se', 'sa', 14),
  ('ソ', 'so', 'sa', 15),
  ('タ', 'ta', 'ta', 16),
  ('チ', 'chi', 'ta', 17),
  ('ツ', 'tsu', 'ta', 18),
  ('テ', 'te', 'ta', 19),
  ('ト', 'to', 'ta', 20),
  ('ナ', 'na', 'na', 21),
  ('ニ', 'ni', 'na', 22),
  ('ヌ', 'nu', 'na', 23),
  ('ネ', 'ne', 'na', 24),
  ('ノ', 'no', 'na', 25),
  ('ハ', 'ha', 'ha', 26),
  ('ヒ', 'hi', 'ha', 27),
  ('フ', 'fu', 'ha', 28),
  ('ヘ', 'he', 'ha', 29),
  ('ホ', 'ho', 'ha', 30),
  ('マ', 'ma', 'ma', 31),
  ('ミ', 'mi', 'ma', 32),
  ('ム', 'mu', 'ma', 33),
  ('メ', 'me', 'ma', 34),
  ('モ', 'mo', 'ma', 35),
  ('ヤ', 'ya', 'ya', 36),
  ('ユ', 'yu', 'ya', 37),
  ('ヨ', 'yo', 'ya', 38),
  ('ラ', 'ra', 'ra', 39),
  ('リ', 'ri', 'ra', 40),
  ('ル', 'ru', 'ra', 41),
  ('レ', 're', 'ra', 42),
  ('ロ', 'ro', 'ra', 43),
  ('ワ', 'wa', 'wa', 44),
  ('ヲ', 'wo', 'wa', 45),
  ('ン', 'n', 'n', 46),
  ('ガ', 'ga', 'ga', 47),
  ('ギ', 'gi', 'ga', 48),
  ('グ', 'gu', 'ga', 49),
  ('ゲ', 'ge', 'ga', 50),
  ('ゴ', 'go', 'ga', 51),
  ('ザ', 'za', 'za', 52),
  ('ジ', 'ji', 'za', 53),
  ('ズ', 'zu', 'za', 54),
  ('ゼ', 'ze', 'za', 55),
  ('ゾ', 'zo', 'za', 56),
  ('ダ', 'da', 'da', 57),
  ('ヂ', 'ji', 'da', 58),
  ('ヅ', 'zu', 'da', 59),
  ('デ', 'de', 'da', 60),
  ('ド', 'do', 'da', 61),
  ('バ', 'ba', 'ba', 62),
  ('ビ', 'bi', 'ba', 63),
  ('ブ', 'bu', 'ba', 64),
  ('ベ', 'be', 'ba', 65),
  ('ボ', 'bo', 'ba', 66),
  ('パ', 'pa', 'pa', 67),
  ('ピ', 'pi', 'pa', 68),
  ('プ', 'pu', 'pa', 69),
  ('ペ', 'pe', 'pa', 70),
  ('ポ', 'po', 'pa', 71),
  ('キャ', 'kya', 'kya', 72),
  ('キュ', 'kyu', 'kya', 73),
  ('キョ', 'kyo', 'kya', 74),
  ('シャ', 'sha', 'sha', 75),
  ('シュ', 'shu', 'sha', 76),
  ('ショ', 'sho', 'sha', 77),
  ('チャ', 'cha', 'cha', 78),
  ('チュ', 'chu', 'cha', 79),
  ('チョ', 'cho', 'cha', 80),
  ('ニャ', 'nya', 'nya', 81),
  ('ニュ', 'nyu', 'nya', 82),
  ('ニョ', 'nyo', 'nya', 83),
  ('ヒャ', 'hya', 'hya', 84),
  ('ヒュ', 'hyu', 'hya', 85),
  ('ヒョ', 'hyo', 'hya', 86),
  ('ミャ', 'mya', 'mya', 87),
  ('ミュ', 'myu', 'mya', 88),
  ('ミョ', 'myo', 'mya', 89),
  ('リャ', 'rya', 'rya', 90),
  ('リュ', 'ryu', 'rya', 91),
  ('リョ', 'ryo', 'rya', 92),
  ('ギャ', 'gya', 'gya', 93),
  ('ギュ', 'gyu', 'gya', 94),
  ('ギョ', 'gyo', 'gya', 95),
  ('ジャ', 'ja', 'ja', 96),
  ('ジュ', 'ju', 'ja', 97),
  ('ジョ', 'jo', 'ja', 98),
  ('ビャ', 'bya', 'bya', 99),
  ('ビュ', 'byu', 'bya', 100),
  ('ビョ', 'byo', 'bya', 101),
  ('ピャ', 'pya', 'pya', 102),
  ('ピュ', 'pyu', 'pya', 103),
  ('ピョ', 'pyo', 'pya', 104);
