# Paritatea migrațiilor pe cele 3 proiecte Supabase

Din 2026-09-22 există trei proiecte `public` cu schemă înrudită, nu unul:

| Proiect | Ref | Regiune | Stare |
|---|---|---|---|
| **vechi/live** | `hmbemylaqnkiamvhcdcd` | eu-west-1 | **ÎNGHEȚAT** — sursă de adevăr pentru cei 8 utilizatori reali originali, DOAR citit. Nicio migrație nouă nu se mai aplică aici niciodată. |
| **EU-nou** | `zrgcullndfhouencqqqc` | eu-central-1 | Activ, primește trafic real (login EU). Are `mirror_us` + `admin_all` (Faza 6). |
| **US-nou** | `wftwdbiqnlqsvgpeypmb` | us-east-1 | Activ, primește trafic real (login Americas). Are și el `mirror_eu` + `admin_all` (2026-09-23, oglindă simetrică — un admin se poate muta liber, panoul Teacher funcționează pe oricare regiune). |

Riscul real: cineva scrie o migrație, o aplică pe un singur proiect din cele două active, uită de
celălalt, și schema diverge silențios — PostgREST nu dă nicio eroare vizibilă până cineva lovește
funcția/coloana lipsă în producție pe regiunea neatinsă.

## Domeniul fiecărei migrații de până acum

Nu toate migrațiile se aplică identic pe ambele proiecte active — unele sunt asimetrice prin design
(Faza 5 — replicare leaderboard — și Faza 6 — mirror admin — au jumătăți diferite pe fiecare parte).

| Migrație | vechi/live | EU-nou | US-nou | Notă |
|---|:-:|:-:|:-:|---|
| `20260921000000_baseline.sql` | ✅ (originea) | ✅ | ✅ | `supabase db push` la creare |
| `20260922011720_fix_new_project_bootstrap_grants.sql` | — | ✅ | ✅ | bug doar la proiecte noi bootstrap-uite; vechiul nu l-a avut niciodată |
| `20260922194231_admin_mirror_us_publication.sql` | — | — | ✅ | publică cele 16 tabele pt. `mirror_us` |
| `20260922200515_leaderboard_cross_region_export.sql` | — | ✅ | ✅ | text identic pe ambele |
| `20260922200735_leaderboard_cross_region_union.sql` | — | ✅ | ✅ | text identic pe ambele |
| `20260922200900_leaderboard_replication_setup.sql` | — | ✅ (jumătatea EU) | ✅ (jumătatea US) | fișier de referință, NU re-rulabil orbește — vezi comentariile din el |
| `20260922203458_admin_mirror_us_schema.sql` | — | ✅ | — | `mirror_us` există doar pe EU (adminul e doar acolo) |
| `20260922203511_admin_mirror_us_views.sql` | — | ✅ | — | idem |
| `20260922203531_admin_mirror_us_functions.sql` | — | ✅ | — | idem |
| `20260922222732_grant_users_self_edit_columns.sql` | — | ✅ | ✅ | vechiul avea deja aceste GRANT-uri de coloană |
| `20260923003744_fix_mirror_us_replication.sql` | — | ✅ | — | înlocuiește `mirror_us_sub` (replicare logică, stricată) cu `postgres_fdw` + `pg_cron` — vezi secțiunea de mai jos |
| `20260923012239_region_move_retirement.sql` | — | ✅ | ✅ | `retired_to_region` pe `public.users` + gardă în `cancel_pending_account_deletion()` + `check_account_moved()` — pentru mutarea self-service între regiuni |
| `20260923024343_admin_mirror_eu_schema_views_functions.sql` | — | — | ✅ | oglindă a celor 3 fișiere ale Fazei 6 (schema+views+cele 13 funcții `admin_*`), dar `mirror_eu` în loc de `mirror_us` — panoul Teacher funcționează acum și cu contul admin mutat pe US |
| `20260923024501_admin_mirror_eu_fdw_setup.sql` | — | — | ✅ | `postgres_fdw` (EU→US) + `pg_cron`, oglindă a fix-ului de mai sus dar în sens invers |
| `20260923043228_admin_roster_exclude_pending_deletion.sql` | — | ✅ | ✅ | `admin_get_student_roster`/`admin_get_dashboard_stats` exclud acum `pending_deletion_at is not null` — altfel un cont retras printr-o mutare de regiune rămânea vizibil dublat în panoul Teacher până expira grace period-ul de 30 zile |
| `20260923044546_admin_leads_mirror_and_student_region_eu.sql` | — | ✅ | — | `free_lesson_leads` intră în oglinda cross-region (`mirror_us`/`admin_all`, RPC nou `admin_get_free_lesson_leads`/`admin_update_lead_contacted`, `admin_get_dashboard_stats` citește leads din `admin_all` acum) + `admin_get_student_detail` întoarce și `region` ('eu'/'us') |
| `20260923044623_admin_leads_mirror_and_student_region_us.sql` | — | — | ✅ | oglindă a fișierului de mai sus, `mirror_eu`/`mirror_eu_fdw` în loc de `mirror_us`/`mirror_us_fdw`, etichete 'us'/'eu' inversate |
| `20260923051955_mirror_us_users_add_retired_to_region.sql` | — | ✅ | — | bug găsit scriind fișierul de mai sus: `mirror_us.users` (snapshot din 2026-09-22) și `mirror_us_fdw.users` (foreign table importat tot atunci) au ratat coloana `retired_to_region`, adăugată pe `public.users` a doua zi de `region_move_retirement` — un `SELECT *` proaspăt pica cu mismatch de coloane, iar cronul `mirror-us-refresh` ar fi picat la primul refresh după ce coloana era adăugată doar pe o parte. Reparat pe ambele (foreign table + tabelul local) + view-ul `admin_all.users` re-expandat. `mirror_eu`/`mirror_eu_fdw` de pe US-nou nu au avut problema (create ulterior, deja cu coloana) |
| `20260923152640_premium_trial.sql` | — | ✅ | ✅ | text identic pe ambele: `premium_until` pe `public.users` (NULL = Pro fără termen), trial de 7 zile în `handle_new_user()`, trigger care golește `premium_until` când Stripe atașează un customer nou, cron `premium-trial-expiry` (5 min). Trebuie aplicat pe AMBELE înaintea fișierelor `_admin_*` de mai jos (altfel refresh-ul oglinzii pică pe coloana lipsă de pe partea cealaltă) |
| `20260923152656_premium_trial_admin_eu.sql` | — | ✅ | — | `premium_until` în `mirror_us.users` + `mirror_us_fdw.users` (aceeași poziție finală) + `admin_all.users` re-expandat; `admin_get_student_roster` întoarce și `premium_until`/`has_stripe`/`region`/`study_track`; RPC nou `admin_set_student_premium` (scrie prin fdw pentru elevii US) |
| `20260923152732_premium_trial_admin_us.sql` | — | — | ✅ | oglindă a fișierului de mai sus, `mirror_eu`/`mirror_eu_fdw`, etichete 'us'/'eu' inversate |
| `20260923153630_avatar_storage_gc.sql` | — | ✅ | ✅ | text identic pe ambele: schema `avatar_gc` — trigger pe `public.users` (AFTER DELETE) care șterge folderul `avatars/<user_id>/` prin Storage API (pg_net), `avatar_gc.collect()` (sweep pentru fișiere nereferențiate, dry run implicit) + limite pe bucket-ul `avatars` (5MB, webp/jpeg/png). Are nevoie de secretul vault `project_url` + cronul `avatar-gc` — setup operațional în comentariile de la finalul fișierului |
| `20260923155526_kanji_detail_words_exclude_shared_furigana.sql` | — | ✅ | ✅ | text identic pe ambele: `rebuild_kanji_detail_words()` nu mai alege cuvinte în care furigana kanji-ului e comună cu un kanji vecin (jukujikun/ateji: 今日, 大人, 田舎) decât ca rezervă pentru un kanji fără alte cuvinte; include `select rebuild_kanji_detail_words()` (5202 → 5191 rânduri pe ambele) |
| `20260923165827_admin_student_detail_premium_until_eu.sql` | — | ✅ | — | `admin_get_student_detail` întoarce și `premium_until` (coloană nouă la final), pentru data de sfârșit a Pro-ului pe pagina de detaliu a elevului |
| `20260923165828_admin_student_detail_premium_until_us.sql` | — | — | ✅ | oglindă a fișierului de mai sus, `mirror_eu` în loc de `mirror_us`, etichete 'us'/'eu' inversate |
| `20260923170511_leaderboard_peer_excludes_all_local_users.sql` | — | ✅ | ✅ | text identic pe ambele: cele 4 `get_leaderboard_*` exclud din ramura `peer` (cache-ul `lb_export`) orice `user_id` care există local, nu doar pe cei rămași după filtrul `pending_deletion_at is null` — altfel un cont abia șters/retras reapărea până la 5 min pe leaderboard-ul propriei regiuni, din rândul vechi al propriului cache |
| `20260923171152_leaderboard_cross_region_dedup_by_email.sql` | — | ✅ | ✅ | text identic pe ambele, **aplicat pe ambele în aceeași fereastră de 5 min** (coloană nouă pe tabele replicate logic): `lb_export.*_entries.email_key` (sha256 din email normalizat) + `peer` sare rândurile al căror email aparține unui cont local ACTIV — gata duplicatul de pe celălalt continent în timpul/după o mutare de regiune; trigger `lb_export_drop_pending_user` pe `public.users` scoate rândul din exportul propriu în momentul în care se setează `pending_deletion_at`, deci ștergerea ajunge pe celălalt continent în secunde, nu la următorul refresh |
| `20260923174750_fix_vocabulary_furigana_alignment.sql` | — | ✅ | ✅ | text identic pe ambele (date de referință identice byte cu byte): corectează `furiganas`/`romaji_furiganas` la 75 de cuvinte cu furigana greșită (大急ぎ おおい/そ → おお/いそ, 黒色, 画数, 先 さっき, 眼鏡, 日本語…, găsite comparând tot vocabularul cu JmdictFurigana), mută 82 de rânduri `kanji_word` în `reading_group`-ul citirii corecte și rulează `rebuild_kanji_detail_words()` (5191 → 5185 rânduri). Idempotent, cu gardă: se oprește dacă un rând nu mai are valoarea veche sau nouă. Hash-urile celor 3 tabele sunt identice pe EU și US după aplicare |
| `20260923184730_revert_contested_furigana_groupings.sql` | — | ✅ | ✅ | text identic pe ambele: readuce la valorile originale 33 din cele 75 de rânduri de mai sus (真面目, 眼鏡, 二日, 玄人, 師走, cele 15 compuse cu 日本 etc.) — verificare ulterioară pe Wiktionary a arătat că împărțirea originală pe caractere e cea etimologică folosită și de Wiktionary (convenție, nu greșeală) — plus cele 52 de mutări `reading_group` ale lor, apoi `rebuild_kanji_detail_words()` (5185 → 5189). Net față de datele de dinainte de 23.09: 42 de rânduri `vocabulary` și 30 `kanji_word` schimbate. Hash-uri identice EU/US |
| `20260928225158_review_card_alternate_answers.sql` | — | ✅ | ✅ | text identic pe ambele: `get_due_cards`, `complete_vocab_batch`, `get_kanji_intro_cards` întorc la final `kanji_readings` (kun+on) și `word_kanji` (jsonb, kanji-urile cuvântului cu sensurile lor, din funcția nouă `vocabulary_word_kanji`); cartonașele `vocab_meaning` primesc și `romaji_reading`/`other_readings`, iar `kanji_reading` primește `all_primary_word_meanings`. `get_seen_vocab_meaning_cards` întoarce `romaji_reading`, `other_readings`, `word_kanji`. Tip de retur schimbat → drop + create + GRANT-urile din baseline. Pentru răspunsurile „alternative” (citire pe Kanji meaning, citire/sens de kanji pe Vocab meaning, sens/altă citire a kanji-ului pe Word reading). Aplicat pe ambele pe 2026-09-29, în 5 părți (fiecare într-o tranzacție) prin SQL Editor, cu rândul de ledger inclus în ultima parte |
| `20260929193114_new_card_caps_by_level.sql` | — | ✅ | ✅ | text identic pe ambele: plafonul „New kanji/vocabulary per day” se calculează la nivelurile JLPT ale elevului (`get_new_card_caps_for_levels`, `effective_enabled_levels`), nu la toată baza; `clamp_new_card_caps()` folosește nivelurile rândului, deci coboară și o limită care nu mai încape după o schimbare de nivel. `get_new_card_caps()` rămâne (toate nivelurile) pentru clienți vechi. Aplicat pe ambele pe 2026-09-29 prin SQL Editor, cu rândul de ledger inclus |
| `20261004184744_password_auth_relax_gmail_rule.sql` | — | ✅ | ✅ | **aplicată 2026-10-05 pe EU și US, ledger completat** (text identic pe ambele): regula „doar Gmail” trece de la emailul contului la identitățile Google (`on_auth_identity_require_gmail`), dispare `users_email_gmail_check`, `handle_new_user()` nu mai pune „User Nou” conturilor care nu vin de la Google, RPC `has_password()`. Vezi `docs/PASSWORD_AUTH_PLAN.md` |
| `20261007054237_region_move_sync_identities.sql` | — | ✅ | ✅ | **aplicată 2026-10-07 pe EU și US, ledger completat** (text identic pe ambele): `region_move_sync_identities(user, identities)`, doar `service_role` — mutarea self-service de regiune duce acum și identitățile legate (Google) pe contul nou: Admin API `createUser` face doar identitatea `email`, iar GoTrue nu are endpoint de linkare. Inserează ce lipsește, lasă ce există, scoate ce sursa nu mai are, sare peste o identitate care aparține deja altui cont din proiect (`taken`), recalculează `app_metadata.providers`. Apelată de `stepSyncIdentities` din `worker/lib/regionMove.ts` |

| `20261007064115_kanji_words_admin_tables.sql` | — | ✅ | ✅ | **aplicată 2026-10-07 pe EU și US, ledger completat** (text identic pe ambele): cuvintele fiecărui kanji editabile de admin (`/admin/kanji-words`, vezi `docs/KANJI_WORDS_ADMIN_PLAN.md`). `rebuild_kanji_detail_words()` scrie acum în `kanji_detail_words_algo` + `kanji_word_algo_info` și apoi `apply_kanji_word_overrides()` reface `kanji_detail_words` (algoritm − `remove` + `add`); cheile de sortare stau în view-ul `kanji_word_sort_keys`. Tabele noi: `kanji_word_overrides`, `kanji_word_review`, `kanji_word_history` (append-only, trigger), `kanji_detail_words_snapshots` (append-only, cron zilnic `kanji-words-snapshot`). Autotest în migrație: lista rezultată identică cu cea de dinainte (5189 rânduri, hash `94f91efe…` pe ambele). `rebuild` nu mai e executabilă de `anon`/`authenticated`. **Dacă rulezi `rebuild` din nou, rulează-l pe AMBELE regiuni în aceeași ședință** |
| `20261007064452_kanji_words_admin_rpcs.sql` | — | ✅ | ✅ | **aplicată 2026-10-07 pe EU și US, ledger completat** (text identic pe ambele): `kw_commit`/`kw_apply_items`/`kw_push`/`kw_restore_item`/`kw_stats` (interne) + 11 RPC-uri `admin_*_kanji_word*` (citire: overview, candidați, istoric, loturi, număr de verificat, paritate; scriere: salvare, restaurare versiune, operații în masă, anulare lot, restaurare globală). Orice scriere ajunge și pe cealaltă regiune în aceeași tranzacție, prin `kw_push` |
| `20261007064713_kanji_words_admin_remote_eu.sql` | — | ✅ | — | **aplicată 2026-10-07, ledger completat:** `kw_remote_schema()` → `mirror_us_fdw` + import (`batch_size=500`) al `kanji_detail_words`, `kanji_word_overrides`, `kanji_word_review`, `kanji_word_history` din US. Trebuie aplicată DUPĂ ce US are fișierele de mai sus |
| `20261007064714_kanji_words_admin_remote_us.sql` | — | — | ✅ | **aplicată 2026-10-07, ledger completat:** oglinda, `mirror_eu_fdw`. Push-ul testat în ambele sensuri (salvare, lot de 519 kanji, anulare, conflict) într-o tranzacție anulată: paritate exactă, nimic rămas scris |
| `20261007162951_number_meanings_add_digits.sql` | — | ✅ | ✅ | **aplicată 2026-10-07, ledger completat:** cifra lângă numărul scris cu litere în `kanji.meanings` (25 kanji) și `vocabulary.primary_meanings` (15 cuvinte, cu fracții 半/分/厘); repară 万 (`10 \| 000` → `10,000`); date de referință identice pe EU și US, verificate după aplicare |
| `20261007193329_region_move_release_source.sql` | — | ✅ | ✅ | **aplicată 2026-10-07 pe EU și US, ledger completat** (text identic pe ambele): `region_move_release_source(user, p_revoke_sessions)` și `region_move_unreleased_sources()`, doar `service_role`. Copia retrasă a unui cont mutat primește emailul `retired-<id>@moved.invalid`, își pierde identitățile Google și (la cerere) sesiunile — altfel un login Google cu emailul vechi, în regiunea sursă, ajungea în contul mort („contul s-a mutat în America”). Apelată de `stepRetireSource` din `worker/lib/regionMove.ts`; Worker-ul se deployează la merge în `main`. Testată în tranzacții anulate pe EU (contul retras real `a491cefa`) și US. Copia `a491cefa` de pe EU eliberată cu ea după aplicare (email → placeholder, 2 identități Google scoase), deci `vici.sensei@gmail.com` e liberă |

| `20261008074030_lesson_teacher_flag.sql` | — | ✅ | ✅ | **aplicată 2026-10-08 pe EU și US, ledger completat** (text identic pe ambele): `users.is_teacher boolean not null default false` (rezervări la lecții, vezi `docs/LESSON_BOOKING_PLAN.md`). Setat doar de Worker; `authenticated` are UPDATE pe coloane doar la cele 4 câmpuri de profil. Trebuie aplicat pe AMBELE înaintea fișierelor `_mirror_*` |
| `20261008074042_lesson_teacher_flag_mirror_eu.sql` | — | ✅ | — | **aplicată 2026-10-08 pe EU, ledger completat:** `is_teacher` în `mirror_us.users` + `mirror_us_fdw.users` (aceeași poziție finală) + `admin_all.users` re-expandat. Fără ea, `mirror_us.refresh_all()` (`SELECT *` pozițional) pică |
| `20261008074043_lesson_teacher_flag_mirror_us.sql` | — | — | ✅ | **aplicată 2026-10-08 pe US, ledger completat:** oglinda de mai sus, `mirror_eu`/`mirror_eu_fdw`, `admin_all.users` |
| `20261008074504_lessons_writer_core.sql` | — | ✅ | — | **aplicată 2026-10-08 pe EU, ledger completat, doar EU (scriitorul de locuri):** schema `lessons` (clase cu versiuni, studenți, înscrieri fixe, mutări pe o săptămână, jurnal append-only), funcții interne și 12 RPC-uri `public.lesson_*` doar pentru `service_role` (programul elevului, înscriere/ieșire/mutare/anulare mutare, prima zi a săptămânii, acces elev, creare/editare clasă în modurile follow/release/end, mutare de regiune, profesor). US nu primește fișierul; replica de citire e separată. Testată local pe PostgreSQL 18: 109 verificări (capacitate, DST București/New York, cotă, administrare) și 12 conexiuni simultane pe 3 locuri, exact 3 reușite |
| `20261008081641_lessons_schedule_fixed_and_moves.sql` | — | ✅ | — | **aplicată 2026-10-08 pe EU, ledger completat, doar EU:** `lesson_get_schedule` (aceeași semnătură, drepturile rămân) întoarce în plus `student.fixed` (clasele fixe ale elevului, cu titlu, zi/oră NY și următoarea lecție) și `moved_to` pe lecția cedată printr-o mutare pe o săptămână. Pagina `/lessons` are nevoie de ele ca să știe care clase sunt ale elevului și să poată anula o mutare. Testată local (121 de verificări SQL în total) |
| `20261008103823_lessons_staff_exceptions.sql` | — | ✅ | — | **aplicată 2026-10-08 pe EU, ledger completat, doar EU:** etapa 3 a scriitorului de lecții. Tabele noi (`occurrence_overrides`, `vacations`, `extras`, `attendance`, `notifications`, coloana `classes.kind`), excepții pe o singură ședință (anulare, mutare, profesor înlocuitor, link), ședințe unice, vacanțe, participanți „în plus” (scaune suplimentare), înscrieri făcute de personal prin aceleași implementări interne ca ale elevului, prezență, citirile panoului (overview, studenți, detaliu), `lesson_student_removed` / `lesson_list_student_keys`. Repară `has_access(true, NULL, NULL)` (o lecție anulată nu are început și își păstra locurile). 32 de RPC-uri `public.lesson_*`, toate doar pentru `service_role`. Testată local (120 de verificări noi + 121 vechi) și prin repetiție în tranzacție anulată pe EU |
| `20261008111342_lessons_notifications.sql` | — | ✅ | — | **aplicată 2026-10-08 pe EU (repetiție anulată întâi, apoi aplicare atomică cu rândul din ledger), doar EU:** etapa 4 a scriitorului de lecții. `notifications` primește `inapp`, `expires_at` și coloanele de livrare (lease, încercări, următoarea încercare; starea nouă `sending`); tabel nou `notification_prefs` (doar ce a schimbat elevul: mementourile 24h/1h/10min × în aplicație/email/push; restul notificărilor nu se pot opri); `lessons.notify` înlocuit (întoarce boolean, respectă comutatoarele, primește expirare); `lessons.materialize_due()` (mementouri cu cel mai strâns prag neajuns la expirare, avertizări DST la 14/7/2 zile doar pentru etapa curentă) apelat de `public.lesson_scheduler_tick()`; RPC-uri pentru inbox și comutatoare (`lesson_notifications_list/mark_read`, `lesson_notification_prefs_get/set`) și pentru Worker (`lesson_notifications_due` cu lease 10 minute, `lesson_notification_mark` cu `sent/skipped/retry/failed/release`). Job `pg_cron` `lessons-scheduler` la fiecare minut (creat doar unde există `pg_cron`). 39 de funcții `lesson_*`, toate doar `service_role`. |
| `20261008115636_lessons_waitlist.sql` | — | ✅ | — | **aplicată 2026-10-08 pe EU (repetiție anulată întâi, apoi aplicare atomică cu rândul din ledger), doar EU:** etapa 5a (lista de așteptare). Tabel `lessons.waitlist` (fixed/once, înlocuire sau schimb opțional, `armed`/`episodes`); `lessons.waitlist_sweep()` rulat la sfârșitul oricărei tranzacții care atinge locuri (6 triggere constraint deferred) și din `lesson_scheduler_tick`; notificare `waitlist_seat` către TOȚI cei care așteaptă, primul care confirmă câștigă (confirmarea rulează codul normal de înscriere/mutare); RPC-uri `lesson_waitlist_list/join/leave/confirm` și `lesson_staff_waitlist`; maximum 3 intrări per elev. 44 de funcții `lesson_*`, toate doar `service_role`. |
| `20261008142512_lessons_push.sql` | — | ✅ | — | **aplicată 2026-10-08 pe EU (repetiție anulată întâi, apoi aplicare atomică cu rândul din ledger), doar EU:** etapa 5b (push web). Tabel `lessons.push_subscriptions` (un rând per dispozitiv, max 5 per elev, un endpoint aparține unui singur elev); `notifications` primește `push_attempts/next/claimed/error` și starea `sending`; `lessons.notify` înlocuit (împinge doar către elevii cu dispozitiv, mementourile respectă comutatorul „push”); RPC-uri `lesson_push_subscribe/unsubscribe/state` și `lesson_push_due` (lease 10 minute) / `lesson_push_mark` (`sent/skipped/retry/failed/release`, șterge dispozitivele raportate dispărute). 49 de funcții `lesson_*`, toate doar `service_role`. |

**Regulă pentru orice migrație nouă:** decide explicit domeniul (ambele proiecte active / doar EU /
doar US) înainte de a scrie fișierul, scrie decizia într-un comentariu pe primul rând al fișierului
(exact ca migrațiile de mai sus), și adaugă un rând în tabelul de mai sus după ce se aplică.

## Verificare de paritate (de rulat după orice lot de migrații noi)

Rulează pe **fiecare** proiect activ (EU-nou și US-nou) — SQL Editor din Dashboard e cel mai simplu,
sau `psql` dacă parola e în `pgpass.conf`:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

Compară lista cu coloana relevantă din tabelul de mai sus (EU sau US). Orice `✅` din tabel care nu
apare în rezultat = migrație aplicată pe disc dar nu pe acel proiect (sau aplicată dar neînregistrată
în ledger — vezi gap-ul de mai jos).

## Gap găsit și reparat (2026-09-23)

Confirmat prin `psql` direct (citire): ledger-ul de pe EU-nou/US-nou avea DOAR baseline +
`fix_new_project_bootstrap_grants` — celelalte 7 migrații fuseseră aplicate (schema verificată direct:
`lb_export`/`mirror_us`/`admin_all` există, cele 9 funcții `admin_get_student_*` există, publicația
`mirror_us_pub` există pe US) dar niciodată înregistrate, exact din cauza de mai sus (`psql` direct,
nu `supabase db push`). Ledger-ul a fost completat pe ambele proiecte (`insert ... on conflict do
nothing`, backfill din tabelul de scop de mai sus) — acum are exact rândurile așteptate din coloanele
EU/US ale tabelului. Dacă apare din nou acest gap la o migrație viitoare, aceleași `insert`-uri
(un rând per `version`/`name`) rezolvă problema.

## Bug găsit și reparat (2026-09-23): `mirror_us_sub` replica în `public`, nu în `mirror_us`

Verificare directă (`pg_subscription_rel`, schema rezolvată explicit) a confirmat că subscripția
`mirror_us_sub` de pe EU (Faza 6) scria de fapt în tabelele LIVE `public.*`, nu în `mirror_us.*` cum
era proiectat — replicarea logică nativă Postgres potrivește tabelul țintă STRICT după numele
calificat cu schemă publicat de sursă (`public.users`), fără nicio opțiune de remapare (asta există
doar în extensia `pglogical`, indisponibilă pe Supabase). Confirmat cu date reale: primul utilizator
real de pe US (`bluekitsunebi@gmail.com`, semnat 2026-09-22 22:38, testul live din Faza 7) apărea ca
rând autentic în `public.users`/`public.leaderboard_stats`/`public.user_study_settings` de pe EU.

**Reparat** cu `20260923003744_fix_mirror_us_replication.sql`: `postgres_fdw` (server + foreign
tables `mirror_us_fdw.<table>`, citind live din US) + `pg_cron` la 5 min (`mirror_us.refresh_all()`)
care populează `mirror_us.<table>` din foreign tables — fără constrângerea de nume, spre deosebire de
replicarea logică. Subscripția stricată a fost ștearsă (`DROP SUBSCRIPTION mirror_us_sub`), rândul
contaminat șters din `public.*`. Detalii tehnice complete în `docs/MULTI_REGION_ARCHITECTURE.md`.

**De reținut pentru orice replicare viitoare între cele două proiecte:** replicarea logică nativă
funcționează DOAR când tabelul țintă are exact același nume+schemă ca la sursă (cazul Fazei 5,
`lb_export.eu_entries`/`us_entries`, identice pe ambele proiecte). Când numele diferă (cazul unui
mirror într-o schemă cu alt nume), soluția e `postgres_fdw` + refresh programat, nu
`CREATE SUBSCRIPTION`.

## De ce nu e (încă) un script automat

CLI-ul Supabase autentificat pe această mașină are acces DOAR la contul vechi (`hmbemylaqnkiamvhcdcd`)
— vezi `reference-supabase-cli-and-live-db` din memorie. `supabase migration list --linked` nu poate
ținti EU-nou/US-nou fără un `supabase login` interactiv separat, netentat până acum ca să nu se piardă
accesul la contul vechi. Până atunci, verificarea de mai sus e manuală (SQL Editor sau `psql` cu
`pgpass.conf` completat pentru toate cele 3 proiecte).
