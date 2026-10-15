-- EU-new + US-new BOTH, identical text. Part 1 of 3 of editing a word's dictionary data from /admin/kanji-words
-- (the pencil on a word card): an append-only log of every edit and the admin RPC that saves one word. Parts 2/3
-- (_remote_eu / _remote_us) import the two tables it writes on the other region as foreign tables.
--
-- vocabulary is reference data, identical on EU and US (17,349 rows, same hash on both, 2026-10-15). The RPC writes
-- the admin's own region, then the other one through the same postgres_fdw link the kanji-words push uses
-- (kw_remote_schema()), in ONE transaction: if the other region refuses, nothing stays written here either.
--
-- Editable columns (the popup's fields): kana_reading, romaji_reading, furiganas, romaji_furiganas, other_readings,
-- short_meaning, primary_meanings, other_meanings, parts_of_speech, jlpt_level, is_common_jisho, usually_kana,
-- study_enabled. The word itself, ids_kanji and frequency_number are not.
--
-- The kanji lists are NOT recomputed here. The algorithm (rebuild_kanji_detail_words) reads jlpt_level,
-- is_common_jisho, usually_kana, furiganas and study_enabled and picks an edit up at its next rebuild (run on both
-- regions in the same sitting, as always), which flags every kanji whose pick changed as "algorithm changed".
-- Everything else that reads vocabulary (study cards, level counts, the dictionary) sees the edit at once.
--
-- Errors the page maps (message text): vocabulary_conflict (SQLSTATE 40001, the word changed since the popup loaded
-- it, here or on the other region), vocabulary_invalid (22023, DETAIL says what is wrong), vocabulary_unknown,
-- vocabulary_remote_missing (parts 2/3 not applied yet).

-- ---------- The log ----------

create table public.vocabulary_edits (
  id uuid primary key default gen_random_uuid(),
  -- no foreign key on purpose, like kanji_word_history: nothing a reference-data refresh does may delete or block
  -- a log row
  vocabulary_id bigint not null,
  -- the editable columns before and after (vocabulary_editable()), so any edit can be undone by hand
  before jsonb not null,
  after jsonb not null,
  admin_id uuid,
  admin_email text,
  created_at timestamptz not null default now()
);
create index idx_vocabulary_edits_vocabulary on public.vocabulary_edits (vocabulary_id, created_at desc);

create trigger vocabulary_edits_append_only_row
  before update or delete on public.vocabulary_edits
  for each row execute function public.kanji_words_block_mutation();
create trigger vocabulary_edits_append_only_truncate
  before truncate on public.vocabulary_edits
  for each statement execute function public.kanji_words_block_mutation();

-- New public tables are granted ALL to anon/authenticated by default here; clients only ever go through the RPC.
alter table public.vocabulary_edits enable row level security;
revoke all on table public.vocabulary_edits from public, anon, authenticated;

-- ---------- Helpers (not callable by clients) ----------

-- The editable columns of a vocabulary row given as jsonb (to_jsonb of a row, local or foreign, or what the page
-- sends), and nothing else: what the conflict checks compare and what the log keeps.
create or replace function public.vocabulary_editable(p jsonb)
returns jsonb
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(coalesce(p, '{}'::jsonb)) e
  where e.key = any (array[
    'kana_reading', 'romaji_reading', 'furiganas', 'romaji_furiganas', 'other_readings', 'short_meaning',
    'primary_meanings', 'other_meanings', 'parts_of_speech', 'jlpt_level', 'is_common_jisho', 'usually_kana',
    'study_enabled'])
$function$;

-- A jsonb list of texts as text[], each trimmed. p_positional keeps every entry (furigana: one per character of
-- the word, '' and '-' included); otherwise blank entries are dropped. JSON null = empty list.
create or replace function public.vocabulary_text_list(p jsonb, p_label text, p_positional boolean default false)
returns text[]
language plpgsql
immutable
set search_path to 'public'
as $function$
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return '{}'::text[];
  end if;
  if jsonb_typeof(p) <> 'array' or exists (select 1 from jsonb_array_elements(p) e where jsonb_typeof(e) <> 'string') then
    raise exception 'vocabulary_invalid' using errcode = '22023', detail = format('%s must be a list of texts.', p_label);
  end if;
  return array(
    select btrim(t.e)
    from jsonb_array_elements_text(p) with ordinality t(e, i)
    where p_positional or btrim(t.e) <> ''
    order by t.i);
end;
$function$;

revoke all on function public.vocabulary_editable(jsonb) from public, anon, authenticated;
revoke all on function public.vocabulary_text_list(jsonb, text, boolean) from public, anon, authenticated;

-- ---------- Admin RPC ----------

-- Save one word. p_expected: the editable columns as the popup loaded them (a mismatch, here or on the other region,
-- is a conflict); p_values: every editable column as the admin wants it. Returns {changed, vocabulary (the editable
-- columns now), kanji_word_ids (every kanji_word row of the word, for the page to refresh)}. Nothing different from
-- what is stored = nothing written, no log row.
create or replace function public.admin_update_vocabulary(p_vocabulary_id bigint, p_expected jsonb, p_values jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s text := public.kw_remote_schema();
  v_uid uuid := auth.uid();
  v_row public.vocabulary;
  v_before jsonb;
  v_remote jsonb;
  v_chars integer;
  v_kana text;
  v_romaji text;
  v_fur text[];
  v_rfur text[];
  v_other_readings text[];
  v_short text;
  v_primary text[];
  v_other jsonb;
  v_pos text[];
  v_jlpt text;
  v_common boolean;
  v_usually_kana boolean;
  v_enabled boolean;
  v_after jsonb;
  v_edit_id uuid;
  v_at timestamptz;
  v_email text;
  v_n integer;
  v_kanji_word_ids jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'vocabulary_invalid' using errcode = '22023', detail = 'No values were sent.';
  end if;

  select * into v_row from public.vocabulary where id = p_vocabulary_id for update;
  if not found then
    raise exception 'vocabulary_unknown' using errcode = '22023';
  end if;
  v_before := public.vocabulary_editable(to_jsonb(v_row));
  if public.vocabulary_editable(p_expected) is distinct from v_before then
    raise exception 'vocabulary_conflict' using errcode = '40001',
      detail = 'the word changed since it was loaded';
  end if;

  -- ----- Readings -----
  v_kana := nullif(btrim(p_values->>'kana_reading'), '');
  v_romaji := nullif(btrim(p_values->>'romaji_reading'), '');
  if v_kana is null then
    raise exception 'vocabulary_invalid' using errcode = '22023', detail = 'The kana reading can''t be empty.';
  end if;
  if v_romaji is null then
    raise exception 'vocabulary_invalid' using errcode = '22023', detail = 'The romaji can''t be empty.';
  end if;
  v_chars := char_length(v_row.word);
  v_fur := public.vocabulary_text_list(p_values->'furiganas', 'Furigana', true);
  v_rfur := public.vocabulary_text_list(p_values->'romaji_furiganas', 'Romaji furigana', true);
  if cardinality(v_fur) <> v_chars then
    raise exception 'vocabulary_invalid' using errcode = '22023',
      detail = format('Furigana needs exactly one entry per character of the word (%s).', v_chars);
  end if;
  if cardinality(v_rfur) <> v_chars then
    raise exception 'vocabulary_invalid' using errcode = '22023',
      detail = format('Romaji furigana needs exactly one entry per character of the word (%s).', v_chars);
  end if;
  v_other_readings := public.vocabulary_text_list(p_values->'other_readings', 'Other readings');

  -- ----- Meanings -----
  v_short := nullif(btrim(p_values->>'short_meaning'), '');
  v_primary := public.vocabulary_text_list(p_values->'primary_meanings', 'The primary meanings');
  if cardinality(v_primary) = 0 then
    raise exception 'vocabulary_invalid' using errcode = '22023', detail = 'At least one primary meaning is needed.';
  end if;
  -- A list of senses, each a list of glosses. Blank glosses and senses left empty are dropped.
  if p_values->'other_meanings' is null or jsonb_typeof(p_values->'other_meanings') = 'null' then
    v_other := '[]'::jsonb;
  elsif jsonb_typeof(p_values->'other_meanings') <> 'array'
     or exists (select 1 from jsonb_array_elements(p_values->'other_meanings') e where jsonb_typeof(e) <> 'array') then
    raise exception 'vocabulary_invalid' using errcode = '22023',
      detail = 'The secondary meanings must be a list of senses, each a list of texts.';
  else
    select coalesce(jsonb_agg(to_jsonb(g.list) order by t.i), '[]'::jsonb)
    into v_other
    from jsonb_array_elements(p_values->'other_meanings') with ordinality t(sense, i)
    cross join lateral (select public.vocabulary_text_list(t.sense, 'Each secondary sense') as list) g
    where cardinality(g.list) > 0;
  end if;
  -- NULL (never linked to a dictionary entry) and [] (linked, no secondary senses) mean different things: an
  -- empty list keeps whichever of the two was stored.
  if v_other = '[]'::jsonb and v_row.other_meanings is null then
    v_other := null;
  end if;

  -- ----- Usage -----
  v_pos := public.vocabulary_text_list(p_values->'parts_of_speech', 'Parts of speech');
  v_jlpt := nullif(btrim(p_values->>'jlpt_level'), '');
  if v_jlpt is not null and v_jlpt <> all (array['N5', 'N4', 'N3', 'N2', 'N1']) then
    raise exception 'vocabulary_invalid' using errcode = '22023',
      detail = 'The JLPT level must be N5, N4, N3, N2, N1 or none.';
  end if;
  if jsonb_typeof(p_values->'is_common_jisho') is distinct from 'boolean'
     or jsonb_typeof(p_values->'usually_kana') is distinct from 'boolean'
     or jsonb_typeof(p_values->'study_enabled') is distinct from 'boolean' then
    raise exception 'vocabulary_invalid' using errcode = '22023',
      detail = 'Common, usually kana and enabled for study must each be yes or no.';
  end if;
  v_common := (p_values->>'is_common_jisho')::boolean;
  v_usually_kana := (p_values->>'usually_kana')::boolean;
  v_enabled := (p_values->>'study_enabled')::boolean;

  v_after := jsonb_build_object(
    'kana_reading', v_kana,
    'romaji_reading', v_romaji,
    'furiganas', to_jsonb(v_fur),
    'romaji_furiganas', to_jsonb(v_rfur),
    'other_readings', to_jsonb(v_other_readings),
    'short_meaning', v_short,
    'primary_meanings', to_jsonb(v_primary),
    'other_meanings', v_other,
    'parts_of_speech', to_jsonb(v_pos),
    'jlpt_level', v_jlpt,
    'is_common_jisho', v_common,
    'usually_kana', v_usually_kana,
    'study_enabled', v_enabled);

  v_kanji_word_ids := to_jsonb(array(
    select kw.id from public.kanji_word kw where kw.id_word = p_vocabulary_id order by kw.id));

  if v_after = v_before then
    return jsonb_build_object('changed', false, 'vocabulary', v_before, 'kanji_word_ids', v_kanji_word_ids);
  end if;

  -- ----- The other region: same row as here before the edit, or nothing is written -----
  if s is null or to_regclass(format('%I.vocabulary', s)) is null
     or to_regclass(format('%I.vocabulary_edits', s)) is null then
    raise exception 'vocabulary_remote_missing' using errcode = '55000',
      detail = 'the other region''s vocabulary tables are not imported as foreign tables yet';
  end if;
  execute format('select to_jsonb(r) from %I.vocabulary r where r.id = $1 for update', s)
    into v_remote using p_vocabulary_id;
  if v_remote is null then
    raise exception 'vocabulary_remote_missing' using errcode = '55000',
      detail = 'the other region has no such word';
  end if;
  if public.vocabulary_editable(v_remote) is distinct from v_before then
    raise exception 'vocabulary_conflict' using errcode = '40001',
      detail = 'the other region holds a different version of this word';
  end if;

  update public.vocabulary
  set kana_reading = v_kana,
      romaji_reading = v_romaji,
      furiganas = v_fur,
      romaji_furiganas = v_rfur,
      other_readings = v_other_readings,
      short_meaning = v_short,
      primary_meanings = v_primary,
      other_meanings = v_other,
      parts_of_speech = v_pos,
      jlpt_level = v_jlpt,
      is_common_jisho = v_common,
      usually_kana = v_usually_kana,
      study_enabled = v_enabled
  where id = p_vocabulary_id;

  execute format(
    'update %I.vocabulary set kana_reading = $2, romaji_reading = $3, furiganas = $4, romaji_furiganas = $5, '
    'other_readings = $6, short_meaning = $7, primary_meanings = $8, other_meanings = $9, parts_of_speech = $10, '
    'jlpt_level = $11, is_common_jisho = $12, usually_kana = $13, study_enabled = $14 where id = $1', s)
  using p_vocabulary_id, v_kana, v_romaji, v_fur, v_rfur, v_other_readings, v_short, v_primary, v_other, v_pos,
    v_jlpt, v_common, v_usually_kana, v_enabled;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'vocabulary_remote_missing' using errcode = '55000',
      detail = 'the other region did not take the edit';
  end if;

  v_email := (select u.email from public.users u where u.id = v_uid);
  insert into public.vocabulary_edits (vocabulary_id, before, after, admin_id, admin_email)
  values (p_vocabulary_id, v_before, v_after, v_uid, v_email)
  returning id, created_at into v_edit_id, v_at;
  execute format(
    'insert into %I.vocabulary_edits (id, vocabulary_id, before, after, admin_id, admin_email, created_at) '
    'values ($1, $2, $3, $4, $5, $6, $7)', s)
  using v_edit_id, p_vocabulary_id, v_before, v_after, v_uid, v_email, v_at;

  return jsonb_build_object('changed', true, 'vocabulary', v_after, 'kanji_word_ids', v_kanji_word_ids);
end;
$function$;

revoke all on function public.admin_update_vocabulary(bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_vocabulary(bigint, jsonb, jsonb) to authenticated;
