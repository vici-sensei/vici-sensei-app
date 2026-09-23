# Arhitectura multi-regiune (EU + US)

Rezumat tehnic pentru orice viitor colaborator/sesiune Claude. Istoricul detaliat, decizie cu decizie,
e în memoria proiectului (`project-multi-region-migration-state`) — acest document descrie doar CUM
funcționează sistemul azi, nu cum s-a ajuns aici.

## De ce există

Un singur proiect Supabase (eu-west-1) servea toți utilizatorii, indiferent de continent. Obiectivul:
un al doilea proiect Supabase în America, cu propria bază de date, plus o aplicație care alege automat
regiunea fiecărui utilizator — fără să dubleze leaderboard-ul (trebuie să rămână global) sau panoul de
admin (un singur cont, în Europa, trebuie să vadă ambele regiuni rapid).

## Cele trei proiecte Supabase

| | ref | regiune | rol |
|---|---|---|---|
| vechi/live | `hmbemylaqnkiamvhcdcd` | eu-west-1 | **înghețat** — istoricul celor 8 utilizatori originali, doar citire |
| EU | `zrgcullndfhouencqqqc` | eu-central-1 | live, găzduiește și adminul |
| US | `wftwdbiqnlqsvgpeypmb` | us-east-1 | live |

Cont Supabase `vici.sensei@gmail.com`, org `emkeyvsucgardkmyvbwr` (EU+US; proiectul vechi e pe un cont
diferit). Aceeași parolă DB pe toate trei. Vezi `supabase/MIGRATION_PARITY.md` pentru ce migrație se
aplică unde.

## Cum decide un login regiunea

1. **Client-side, înainte de autentificare** (`lib/supabase/regions.ts`): `getActiveRegion()` citește
   `localStorage["vici-active-region"]`; dacă nu există, ghicește din fusul orar
   (`guessServerRegion()`), rafinat opțional cu geo-IP de la Worker (`GET /api/geo`, singurul endpoint
   public — nu implică niciun email). Utilizatorul poate alege explicit regiunea pe pagina de login
   (selectorul EUROPE/AMERICAS, Faza 7).
2. **`createClient()`** (`lib/supabase/client.ts`) alege proiectul Supabase corespunzător regiunii
   active — câte un client cache-uit per regiune, complet separate (URL, anon key, sesiune proprie).
   Cu `NEXT_PUBLIC_MULTI_REGION` oprit (default istoric), tot acest mecanism e inert și aplicația se
   comportă exact ca înainte de Faza 2.
3. **La signup, hook-ul "Before User Created"** de pe FIECARE proiect Supabase cheamă
   `POST /api/auth-hook/<region>/claim` pe Worker (Standard Webhooks, semnat, `AUTH_HOOK_SECRET_EU`/
   `_US`). Worker-ul face un `INSERT ... ON CONFLICT DO NOTHING` atomic în D1 (`accounts`, cheie =
   emailul normalizat) — primul proiect care cere un email câștigă acea regiune pentru totdeauna.
   Dacă alt proiect cere ulterior același email, hook-ul respinge cu `wrong_region:<regiune corectă>`,
   fail-closed pe orice eroare (semnătură greșită, D1 jos, payload invalid).
4. **`app/auth/callback/page.tsx`** recunoaște `error_description` de forma `wrong_region:<eu|us>` și
   redirecționează la `/login?error=wrong_region&region=<regiune>`; `LoginErrorNotice` arată un toast
   care spune userului regiunea corectă, apoi curăță `?error=` din URL (altfel toast-ul reapărea la
   infinit la fiecare re-render).

## Worker + D1 (`worker/`)

Cloudflare Worker `vici-sensei-app`, servește `out/` (exportul static Next.js) + rutele `/api/*`
(`wrangler.jsonc`: `assets.run_worker_first: ["/api/*"]`, tot restul merge direct la Asset Worker).

- `GET /api/geo` — geo-IP din `request.cf.continent`, public prin design (nu implică niciun email).
- `POST /api/auth-hook/:region/claim` — vezi mai sus.
- **Cron zilnic** (`0 3 * * *`) — keep-alive: `GET /auth/v1/health` pe fiecare proiect (planul Free se
  suspendă după 7 zile de inactivitate), loghează în D1 `keepalive_log`. Fără alertă live — decizie
  explicită a utilizatorului, logat doar în D1.
- **Cron săptămânal** (`0 4 * * 1`) — reconciliere: compară agenda D1 cu `auth.users` real de pe
  fiecare proiect (Admin API, are nevoie de `SUPABASE_SERVICE_ROLE_KEY_EU`/`_US` ca secrete Worker;
  fără ele, no-op logat). Doar detectează divergențe (`reconciliation_log`), nu le repară automat —
  `switch-google-account` (schimbare email) și `process-scheduled-deletions` (ștergere cont) pot lăsa
  D1 neactualizat, decizie explicită de a nu rezolva asta la sursă încă.

D1 (`vici-sensei-accounts`, binding `ACCOUNTS_DB`) e SINGURA sursă de adevăr pentru email→regiune —
nu există un query public care să dezvăluie regiunea unui email oarecare (ar fi o scurgere de
informație despre cine e utilizator).

## Leaderboard — replicare logică Postgres (Faza 5)

Leaderboard-ul trebuie să rămână global (un utilizator EU vede și scorurile din US), dar fiecare
proiect Supabase are propriile tabele. Soluție: fiecare proiect calculează un export ANONIMIZAT al
propriilor utilizatori (schema `lb_export`, aceeași logică de anonimizare ca `get_leaderboard_xp`
pentru un vizitator non-admin) și îl publică prin replicare logică Postgres nativă (`pg_cron` la 5 min
reface exportul, `CREATE PUBLICATION`/`CREATE SUBSCRIPTION` îl trimite la celălalt proiect).
`get_leaderboard_xp/reviews/new_cards/streak` fac `UNION ALL` între datele locale și
`lb_export.<foreign>_entries` — SQL identic pe EU și US, fiindcă propriul export local e mereu
subsetul de care oricum trebuie eliminat prin dedup. `lb_export` nu are niciun grant către
`anon`/`authenticated` — nu e expus direct prin PostgREST, doar citit de funcțiile RPC de mai sus.

## Panou admin — mirror US→EU (Faza 6)

Adminul există doar pe EU. Pentru ca acel cont să vadă și studenții din US fără un al doilea login:
16 tabele US (progres per kanji/vocabular/hiragana/katakana, XP, streak, recenzii — lista completă în
`supabase/migrations/20260922194231_admin_mirror_us_publication.sql`) sunt publicate de US și mirror-ate
continuu (nu la 5 min ca leaderboard-ul — replicare directă de rânduri, fără agregare) în schema
`mirror_us` de pe EU. `admin_all.<table>` = `UNION ALL` între `public.<table>` (local) și
`mirror_us.<table>`. Fiecare funcție folosită de admin (`admin_get_student_*`, 13 la număr) e nouă,
`SECURITY DEFINER`, cu propriul `IF NOT is_admin() THEN RAISE EXCEPTION` — NU s-a atins nicio funcție
existentă folosită și de studenți pentru statisticile proprii (unele dintre ele nu sunt
`SECURITY DEFINER`, se bazează pe RLS; redirectarea lor ar fi permis oricui să citească date mirror-ate
ale altcuiva). `mirror_us` nu are niciun grant/RLS policy către `anon`/`authenticated` — acces zero în
afara funcțiilor `admin_*`, ca apărare suplimentară.

## Auth — Google OAuth și Stripe

Fiecare proiect Supabase nou are Google OAuth configurat cu ACELAȘI client ID, dar dintr-un proiect
Google Cloud SEPARAT de cel al proiectului vechi (`vici-sensei-multi-region`, cont
`vici.sensei@gmail.com`) — External + Production, fără logo custom (evită verificarea Google). Stripe
rămâne UN SINGUR cont (`acct_1SpvNAJGY73upoUl`, comun), dar cu o destinație de webhook separată per
proiect Supabase nou (același `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` diferit per destinație).

## Flag-ul central

`NEXT_PUBLIC_MULTI_REGION` (`lib/supabase/regions.ts`, `isMultiRegionEnabled()`) e citit static de
Next.js — nu poate fi calculat, doar literal. Tot ce ține de multi-regiune (client-ul regional,
selectorul de login, mirror-ul admin) e inert și cade pe calea de cod originală când flag-ul e oprit.
E `true` permanent în `.env.local` și în producție din Faza 7 — proiectul vechi/live nu mai primește
trafic din aplicație, dar rămâne intact ca istoric/sursă de adevăr pentru cei 8 utilizatori originali.

## Ce NU face sistemul (încă)

Mutarea unui cont dintr-o regiune în alta e complet manuală/inexistentă — fiecare proiect are propriul
`auth.users` cu UID-uri diferite, deci nu există un `UPDATE region = ...` simplu. Vezi discuția
"mutare self-service între regiuni" din istoricul de sesiune pentru complexitatea reală, dacă/când
acest feature ajunge să fie construit.
