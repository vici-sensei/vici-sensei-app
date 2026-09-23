# Paritatea migrațiilor pe cele 3 proiecte Supabase

Din 2026-09-22 există trei proiecte `public` cu schemă înrudită, nu unul:

| Proiect | Ref | Regiune | Stare |
|---|---|---|---|
| **vechi/live** | `hmbemylaqnkiamvhcdcd` | eu-west-1 | **ÎNGHEȚAT** — sursă de adevăr pentru cei 8 utilizatori reali originali, DOAR citit. Nicio migrație nouă nu se mai aplică aici niciodată. |
| **EU-nou** | `zrgcullndfhouencqqqc` | eu-central-1 | Activ, primește trafic real (login EU). Are `mirror_us` + `admin_all` (Faza 6, doar aici). |
| **US-nou** | `wftwdbiqnlqsvgpeypmb` | us-east-1 | Activ, primește trafic real (login Americas). Publică cele 16 tabele pentru `mirror_us` (Faza 6). |

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

## Gap cunoscut, de verificat și reparat

Migrațiile de după baseline (toate cele 9 din tabel) au fost aplicate pe EU-nou/US-nou prin `psql`
direct sau din SQL Editor — **nu prin `supabase db push`**, singura cale prin care ledger-ul
(`supabase_migrations.schema_migrations`) se completează automat. Nu există nicio confirmare că
aceste 9 migrații au fost și înregistrate manual în ledger pe cele două proiecte noi. Cel mai probabil
ledger-ul de pe EU-nou/US-nou are DOAR rândul baseline-ului.

Dacă interogarea de mai sus confirmă că lipsesc, completează-l (pe fiecare proiect, doar coloanele lui
`✅` din tabel):

```sql
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260922011720', 'fix_new_project_bootstrap_grants'),
  ('20260922200515', 'leaderboard_cross_region_export'),
  ('20260922200735', 'leaderboard_cross_region_union'),
  ('20260922200900', 'leaderboard_replication_setup'),
  ('20260922222732', 'grant_users_self_edit_columns')
on conflict (version) do nothing;
-- + pe EU-nou, în plus:
  -- ('20260922203458', 'admin_mirror_us_schema'),
  -- ('20260922203511', 'admin_mirror_us_views'),
  -- ('20260922203531', 'admin_mirror_us_functions')
-- + pe US-nou, în plus:
  -- ('20260922194231', 'admin_mirror_us_publication')
```

## De ce nu e (încă) un script automat

CLI-ul Supabase autentificat pe această mașină are acces DOAR la contul vechi (`hmbemylaqnkiamvhcdcd`)
— vezi `reference-supabase-cli-and-live-db` din memorie. `supabase migration list --linked` nu poate
ținti EU-nou/US-nou fără un `supabase login` interactiv separat, netentat până acum ca să nu se piardă
accesul la contul vechi. Până atunci, verificarea de mai sus e manuală (SQL Editor sau `psql` cu
`pgpass.conf` completat pentru toate cele 3 proiecte).
