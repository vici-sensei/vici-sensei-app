Ești asistentul meu pentru proiectul **Vici Sensei** (aplicație pentru învățat japoneza), în folderul `C:\Users\Cezara\Documents\GitHub\vici-sensei-app`.

## Cum vreau să lucrezi cu mine

- Eu **nu sunt programator avansat**. Explică-mi totul **foarte simplu, în română**, ca unui începător.
- Mergi **un singur pas o dată**: spune-mi exact pe ce buton să apăs sau ce comandă să rulez, așteaptă să-ți spun ce a ieșit și abia apoi treci mai departe. Dacă ceva iese altfel decât te așteptai, oprește-te și explică-mi.
- **Nu-mi cere niciodată parole, chei sau tokenuri în chat** și nu le scrie în fișiere din proiect. Când o comandă îmi cere o valoare secretă, o scriu eu direct în terminal.
- Înainte de orice acțiune care publică, șterge sau schimbă ceva real (merge în `main`, deploy, setat secrete, rulat SQL pe baza de date reală), spune-mi ce face și cere-mi un „da”.
- Folosește tool-urile tale pentru a verifica singur ce poți (git, fișiere, teste). Pe mine mă pui doar la ce nu poți face tu (conturi, parole, butoane în dashboard-uri).

## Prima ta mișcare (înainte de orice altceva)

1. Rulează `git branch --show-current` și `git status`. Folderul poate fi acum pe branch-ul `develop`. Toată munca descrisă mai jos este pe branch-ul **`sandbox`** (ultimul commit: `226ff79`, trimis și pe GitHub).
2. Dacă nu ai modificări necomise, treci pe el: `git checkout sandbox`. Dacă ai modificări necomise, spune-mi, nu le pierde.
3. Citește `docs/LESSON_BOOKING_PLAN.md` (în română; are toate deciziile și, la finalul secțiunii 11, „Checklist de lansare") și fișierele de memorie ale proiectului (se încarcă singure; vezi `project_lesson_booking_plan.md`).
4. **`main` nu a fost atins**, deci nimic din funcția nouă nu e încă vizibil elevilor și Worker-ul din producție nu are rutele noi.

## Ce este deja făcut

Am construit (cu o sesiune Claude anterioară) **rezervarea lecțiilor de grup la japoneză**: elevii se înscriu la lecțiile săptămânale ținute de profesori, în maximum 3 elevi pe clasă. Orele claselor sunt fixate în ora New York și se afișează în fusul fiecărui elev. Totul e gata, testat și (pentru baza de date) deja aplicat pe proiectul Supabase EU. Pe scurt:

- **Pentru elev** (`/lessons`): calendar pe zi / săptămână / lună / an; „schimbă clasa mea fixă” sau „mută doar săptămâna asta”; cotă de lecții pe săptămână; **listă de așteptare** (când se eliberează un loc, toți cei care așteaptă sunt anunțați și primul care confirmă îl primește); **notificări** (clopoțel + inbox + banner în aplicație, email, push web) cu mementouri la 24 h / 1 h / 10 min și avertizări la schimbarea orei (DST) cu 14 / 7 / 2 zile înainte; comutatoare pentru mementouri; **Google Calendar** (un calendar al aplicației, partajat doar pentru citire).
- **Pentru admin și profesor** (`/admin/lessons`, `/teach`): clase, excepții pe o singură lecție (anulare, mutare, profesor înlocuitor, link), vacanțe, cine are acces și câte lecții pe săptămână, prezență, cine așteaptă un loc.
- **Mutarea contului între regiuni** (EU ↔ US) își duce și lecțiile după el; conturile șterse își pierd locurile (curățenie săptămânală).

### Cum este construit (important de înțeles)

- **O singură „sursă de adevăr” pentru locuri:** schema `lessons` există DOAR în proiectul Supabase **EU** (`zrgcullndfhouencqqqc`). Toate scrierile trec prin funcții SQL `public.lesson_*` (55), executabile doar cu `service_role`, sub un lock global (ca să nu se poată depăși niciodată 3 locuri). Elevii din US folosesc tot baza EU, prin Worker. Proiectul vechi înghețat `hmbemylaqnkiamvhcdcd` nu se atinge niciodată.
- **Worker-ul Cloudflare** (`worker/`) este singura ușă către baza de date: verifică tokenul utilizatorului în regiunea lui, citește rolul și fusul orar, apoi cheamă O funcție din baza de date. Fișiere: `worker/lib/lessons*.ts` (rute elev/staff/listă de așteptare/notificări/push), `googleCalendar*.ts`, `mailer.ts` (client SMTP mic), `webPush.ts` (criptare push scrisă de mână, verificată cu vectorul de test din RFC 8291), `lessonsAccounts.ts` (mutare de regiune + curățenie conturi). Un job la **5 minute** (`wrangler.jsonc`) scrie notificările scadente, trimite emailurile, push-urile și sincronizează Google Calendar.
- **Aplicația** (Next.js, `output: "export"`): `app/(shell)/lessons/*`, `app/components/lessons-staff/*`, `lib/lessons/*` (reguli de timp și de afișare), `lib/client-data/lessons*.ts`.
- **Migrații** (`supabase/migrations/20261008…`, toate aplicate pe EU cu rândul din ledger; verificate întâi într-o tranzacție anulată): `…074030` teacher flag (EU+US), `…074042/43` oglinzi, `…074504` scriitorul, `…081641`, `…103823`, `…111342` notificări, `…115636` listă de așteptare, `…142512` push, `…143943` rekey, `…145017` Google. Tabelul de stare e `supabase/MIGRATION_PARITY.md`. Regulile pentru migrații sunt în `CLAUDE.md` (niciodată `supabase db push`; fișier nou cu timestamp UTC; aplicare cu `psql` și rând în ledger).
- **Meniul**: linkul „Lessons” apare doar când secretul GitHub `NEXT_PUBLIC_LESSONS` este `true` la build (acum nu e setat; pagina `/lessons` merge oricum prin URL).

### Cum a fost testat

- Teste SQL pe un Postgres 18 temporar (port 55433, folderul `C:\Program Files\PostgreSQL\18`): 535 de verificări + test de concurență (12 cereri simultane pentru 3 locuri: exact 3 câștigători).
- 7 suite „cap-coadă” ale Worker-ului, rulând codul REAL al Worker-ului pe un Supabase simulat și baza locală; plus teste unitare (ore/DST, reguli, email, push).
- O probă în Chrome-ul meu real, cu Worker-ul real și baza temporară (nu baza reală): săptămână/lună/an, mutare pe o săptămână, listă de așteptare, banner „Confirm the seat”, inbox, comutatoare, panou admin.
- **Atenție:** scripturile de test NU sunt în repo; sunt în folderul temporar al sesiunii vechi: `C:\Users\Cezara\AppData\Local\Temp\claude\C--Users-Cezara-Documents-GitHub-vici-sensei-app\820cb189-7626-4537-880a-8b457fdeb258\scratchpad` (au căi scrise de mână). Dacă folderul mai există, propune-mi să le salvăm într-un loc sigur (de ex. un folder `tools/lessons-tests` pe un branch).
- Neverificat fără chei reale: invitația Google pentru conturi Gmail obișnuite și formatul exact al linkului „Open in Google Calendar”; conexiunea STARTTLS către Brevo real (același cod de trimitere îl folosește și heartbeat-ul lunar, deci se verifică ușor după ce secretele sunt puse).

## Ce mai trebuie făcut (în ordinea asta; explică-mi fiecare pas)

**Pasul 1: Publică codul (`sandbox` → `main`).** Explică-mi ce înseamnă, apoi ajută-mă să deschid un Pull Request pe GitHub de la `sandbox` la `main` (sau să fac merge local, cum prefer). Înainte: arată-mi pe scurt ce se schimbă (`git diff --stat main...sandbox`) și verifică că build-ul trece (`npm run build`). La merge, GitHub Actions publică site-ul și Worker-ul. Atenție: planul gratuit Cloudflare permite **5 cron-uri pe cont** și acum folosim exact 5; dacă deploy-ul e refuzat din cauza asta, spune-mi. După deploy verifică: `https://app.vici-sensei.com/api/lessons/schedule?region=eu` trebuie să răspundă 401 `missing_bearer_token` (nu 404). Fără `?region=` răspunde 400 `missing_or_invalid_sourceRegion`, ceea ce arată tot că ruta există.

**Pasul 2: Secretele pentru email (`SMTP_USER` și `SMTP_PASSWORD`).** Explică-mi simplu de unde le iau:
- Sunt datele **contului Brevo** (serviciul care trimite emailurile aplicației, același care trimite emailurile de înscriere): în brevo.com → **SMTP & API → fila SMTP**.
  - `SMTP_USER` = **Login-ul SMTP** (arată ca un email și se termină în `@smtp-brevo.com`).
  - `SMTP_PASSWORD` = **cheia SMTP** (Brevo o arată **o singură dată**, când o creezi). E aceeași cheie pusă și în Supabase (Dashboard → Authentication → SMTP Settings, pentru EU și pentru US; acolo parola e ascunsă, deci nu o poți citi de acolo).
  - Dacă nu mai ai cheia: în Brevo creezi una nouă („Generate a new SMTP key”) și o pui în **trei locuri**: Supabase EU, Supabase US și secretul Worker-ului. Nu o șterge pe cea veche până nu le-ai schimbat pe toate trei, altfel se strică emailurile de înscriere.
  - Pașii exacți sunt și în `docs/PASSWORD_AUTH_DASHBOARD.md`, secțiunile A și F. Verifică mai întâi ce secrete există deja: `npx.cmd wrangler secret list` (poate le-am pus deja pentru heartbeat-ul lunar).
- Se pun cu `npx.cmd wrangler secret put SMTP_USER` și `npx.cmd wrangler secret put SMTP_PASSWORD` (terminalul îmi cere valoarea, eu o lipesc; nu se vede pe ecran). Tot acolo e și `HEARTBEAT_EMAIL_TO` (adresa mea, pentru emailul lunar de control).
- Verificare după aceea: în Brevo, coloana „Last used on” a cheii se actualizează, iar în baza D1 `reconciliation_log` apar rânduri `lesson_mail` (reușit) sau `lesson_mail_problems`. Fără aceste secrete **emailurile așteaptă în coadă** (nu se pierd), iar notificările din aplicație merg oricum.

**Pasul 3: Primele date, reale, și un test pe producție.** În `/admin/lessons` (cu contul meu de admin): marchează profesorii (fila Students), creează clasele (fila Classes), dă acces unui elev de test (contul temporar `bluekitsunebi@gmail.com` e de test, îl pot folosi). Apoi testează în `/lessons`: înscriere, mutare pe o săptămână, lista de așteptare, notificările. Poți folosi extensia Claude in Chrome (eu mă loghez singur în Chrome; tu nu introduci parole). Curăță datele de test la sfârșit și spune-mi ce ai șters.

**Pasul 4 (opțional): Push web.** Rulează `node scripts/generate-vapid-keys.mjs` (scoate două valori). Apoi: `VAPID_PUBLIC_KEY` (public; poate fi variabilă în `wrangler.jsonc` sau secret), `VAPID_PRIVATE_KEY` (**secret**: `npx.cmd wrangler secret put VAPID_PRIVATE_KEY`) și `VAPID_SUBJECT` (de forma `mailto:adresa-mea`). Până atunci comutatorul „push” nu apare elevilor. Pe iPhone/iPad merge doar dacă aplicația e adăugată pe ecranul principal.

**Pasul 5 (opțional): Google Calendar.** Ghidează-mă prin Google Cloud Console: (1) un proiect nou; (2) APIs & Services → Library → „Google Calendar API” → Enable; (3) IAM & Admin → Service Accounts → Create (nu cere roluri); (4) în service account → Keys → Add key → JSON (se descarcă un fișier: secret, nu îl pun în proiect); (5) pun tot conținutul fișierului ca secret: în PowerShell `Get-Content cale\cheie.json | npx.cmd wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON`. Apoi testăm cu contul de test (secțiunea „Google Calendar” din `/lessons`). Până atunci secțiunea nu apare.

**Pasul 6: Pornește meniul.** GitHub → repo → Settings → Secrets and variables → Actions → New repository secret `NEXT_PUBLIC_LESSONS` = `true`, apoi un nou deploy (re-rulează workflow-ul „Deploy”). Se citește la build, deci secretul singur nu face nimic. Abia după ce pașii 1–3 merg.

**Pasul 7: După lansare.** Ajută-mă să verific că jobul de 5 minute rulează (Cloudflare → Workers → Cron / jurnalul D1), că primul memento a ajuns pe email și că nu apar erori.

**Mai târziu / opțional:** decizia despre o replică de citire în US (viteza elevilor din America; vezi secțiunea 13 din plan); salvarea scripturilor de test în repo.

## Reguli ale proiectului (din `CLAUDE.md` și memorie)

- `AGENTS.md`: acest Next.js are diferențe față de cel știut; citește `node_modules/next/dist/docs/` înainte să scrii cod Next.
- Lucrează pe `sandbox`/branch-uri, **nu împinge și nu face merge în `main` fără „da” de la mine**.
- Migrații: scrii fișierul, îl testezi, apoi (cu „da” de la mine) îl aplici cu `psql` în două faze (tranzacție anulată, apoi reală, cu rând în `supabase_migrations.schema_migrations`). Niciodată pe proiectul înghețat. Dacă trebuie o metodă de conectare, e descrisă în memoria „Supabase CLI + live DB”.
- Mai multe sesiuni Claude pot folosi același folder: comite doar fișierele tale, cu `git commit -- <căi>`.
- Verificări înainte de orice commit: `npx tsc --noEmit`, `npx tsc -p worker/tsconfig.json --noEmit`, `npx eslint` pe fișierele atinse (există o eroare veche, nelegată, în `lib/auth/useIsAdmin.ts`).

Începe cu „Prima ta mișcare”, apoi spune-mi în 5–6 propoziții simple unde suntem și întreabă-mă cu ce pas vreau să continuăm.
