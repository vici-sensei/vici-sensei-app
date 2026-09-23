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
