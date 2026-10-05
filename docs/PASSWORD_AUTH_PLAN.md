# Plan: login cu email + parolă (pe lângă Google)

Stabilit pe 2026-10-04, într-o sesiune de întrebări cu utilizatorul. Acest document are trei părți: ce s-a
decis și de ce, ce trebuie făcut manual în Dashboard (Claude nu poate), și fazele de implementare cu
cazurile-limită pe care fiecare fază trebuie să le acopere. Starea reală a fiecărei faze e în ultima secțiune.

## Starea de plecare (verificată pe live, 2026-10-04)

- EU are 8 conturi, toate cu identitate `google`, niciunul cu parolă. US are 0 conturi.
- Providerul `email` e **oprit** pe ambele proiecte (`/auth/v1/settings` → `external.email: false`). Până îl
  pornești din Dashboard, nimic din cod nu poate crea un cont cu parolă.
- Regula „doar Gmail” stă în două locuri din DB: triggerul `on_auth_user_require_gmail`
  (`public.enforce_gmail_email()`, pe `auth.users`) și constrângerea `users_email_gmail_check` pe `public.users`.
  Plus textul din toast-ul de eroare din `app/login/page.tsx` și hint-ul `hd: gmail.com`.
- Hook-ul „Before User Created” (Worker, `POST /api/auth-hook/<region>/claim`) revendică emailul în D1 pentru
  ORICE metodă de înscriere, deci acoperă și parola. NU rulează la schimbarea emailului.
- Clientul Supabase folosește `flowType: 'pkce'` (`lib/supabase/client.ts`). Un link PKCE se strică într-un
  alt browser decât cel din care s-a făcut înscrierea; `verifyOtp` cu `token_hash` nu are problema asta și e
  deja folosit în `lib/client-data/account.ts` (mutarea de regiune).
- `app/auth/callback/page.tsx` apelează `dropStrayEmailIdentity()`, care **șterge** identitatea `email` când
  există una `google`. Cu ambele metode pe același cont, asta ar șterge parola omului la fiecare login Google.
- Nu există pagini Termeni/Confidențialitate. Nu există framework de teste (doar colecția Postman din `postman/`).

## Decizii

| Subiect | Decizie |
|---|---|
| Identificator | Email + parolă. Fără username separat. Numele afișat rămâne `display_name`. |
| Domenii | Orice email valid pentru parolă. Google rămâne **doar `@gmail.com`**. |
| Confirmare | Email cu **cod de 6 cifre + buton** către `/auth/confirm` (merge din orice browser). |
| Trimitere emailuri | SMTP propriu, **Brevo** (gratuit, 300/zi), un singur cont pentru EU și US. |
| Pagini | `/login` și `/signup` separate, butonul Google pe ambele. |
| Fără email | Nu se acceptă conturi fără email real. |
| Email deja existent | Mesaj neutru la înscriere (anti-enumerare). La login, mesaj generic cu indiciul „dacă te-ai înscris cu Google, folosește Google”. |
| Metode legate | Un cont poate avea ambele metode, în ambele sensuri (Setări → „Sign-in methods”). |
| Regiune la login | Încearcă regiunea activă, apoi automat cealaltă. Resetarea parolei se cere pe ambele regiuni. |
| Parolă | Minim 10 caractere, litere și cifre. |
| Anti-bot | Cloudflare Turnstile pe înscriere, login și resetare. |
| Formular înscriere | Email + parolă (cu „arată parola”) + checkbox Termeni. Numele se cere în onboarding. |
| Mutare de regiune | Pentru conturile cu parolă, omul reintroduce parola în fluxul de mutare; Worker-ul o dă o singură dată la crearea contului țintă. |
| Schimbare email | Endpoint nou în Worker care actualizează D1 (revendică noul email, eliberează vechiul). |
| Termeni | Pagini `/terms` și `/privacy` + checkbox obligatoriu la înscriere. Textul final îl alege utilizatorul. |
| Lansare | În spatele `NEXT_PUBLIC_PASSWORD_AUTH=true`, ca `NEXT_PUBLIC_MULTI_REGION`. |

## Pași manuali în Dashboard (utilizatorul, pe EU **și** US)

Fără ei, formularul nu poate funcționa. Codul se poate construi și verifica în paralel, fiindcă e în spatele flag-ului.

1. **Brevo**: cont gratuit, autentifică domeniul `vici-sensei.com` (înregistrările SPF, DKIM, DMARC în DNS-ul
   Cloudflare), creează o cheie SMTP.
2. **Authentication → SMTP Settings**: host/port/user/parolă Brevo, expeditor de tip `no-reply@vici-sensei.com`.
   Apoi **Authentication → Rate Limits**: ridică limita de emailuri/oră de la 30 la ce îți trebuie.
3. **Authentication → Providers → Email**: pornește providerul, „Confirm email” ACTIV, lungimea OTP 6,
   „Secure email change” OPRIT (confirmarea la schimbarea emailului se cere doar pe adresa nouă; contul
   cu parolă oricum cere parola curentă înainte) și „Secure password change” OPRIT (aplicația verifică
   singură parola curentă; cu opțiunea pornită, `updateUser({ password })` ar cere un nonce de reautentificare
   pe care formularele nu-l trimit).
4. **Minimum password length 10** și cerința „letters and digits” (Authentication → Sign In / Providers).
5. **Authentication → URL Configuration**: Site URL `https://app.vici-sensei.com`; adaugă în Redirect URLs
   `https://app.vici-sensei.com/auth/confirm` și `http://localhost:3000/auth/confirm`.
6. **Authentication → Emails → Templates**: înlocuiește „Confirm signup”, „Reset password” și „Change email
   address” cu șabloanele din secțiunea de mai jos. **Șabloanele diferă între proiecte printr-un singur
   cuvânt** (`region=eu` pe EU, `region=us` pe US): un link de email nu știe ce proiect l-a emis, iar
   `verifyOtp` trebuie apelat pe proiectul corect.
7. **Turnstile**: creează un widget în Cloudflare (invisible/managed) pentru `app.vici-sensei.com` și
   `localhost`; pune Secret key în **Authentication → Attack Protection → Captcha** pe ambele proiecte.
   Site key-ul merge în `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
8. La final: `NEXT_PUBLIC_PASSWORD_AUTH=true` și `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site key>` în
   `.env.local` și în mediul build-ului de producție (se citesc la `next build`, nu la runtime).

### Șabloanele de email

`{{ .RedirectTo }}` e trimis de aplicație (`emailRedirectTo` = `<origin>/auth/confirm`); fără el linkul ar cădea
pe Site URL. Pe proiectul **EU** `region=eu`, pe proiectul **US** `region=us`.

Confirm signup (`type=email`), varianta EU:

```html
<h2>Confirm your email</h2>
<p>Your code is <strong style="font-size:22px;letter-spacing:4px">{{ .Token }}</strong></p>
<p>Or <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email&region=eu">confirm in one click</a>
   (works from any browser).</p>
```

Reset password (`type=recovery`) și Change email address (`type=email_change`) au aceeași formă, cu `type`-ul din
paranteză; subiectele le alegi tu. Pagina `/auth/confirm` arată un buton înainte să verifice tokenul, deci
scanerele de linkuri nu îl consumă.

## Faze

### Faza 1 — DB (ambele proiecte)

Migrație nouă: elimină `on_auth_user_require_gmail`/`enforce_gmail_email()` și `users_email_gmail_check`;
adaugă un trigger pe `auth.identities` (BEFORE INSERT/UPDATE) care respinge doar identitățile `google` al căror
email nu e `@gmail.com`. Acoperă înscrierea, `linkIdentity` și „Switch Google account”. În plus,
`handle_new_user()` nu mai pune „User Nou” când contul nu vine de la Google (nume gol → onboarding îl cere).
Verifică înainte cum arată leaderboard-ul pentru un `display_name` NULL.

### Faza 2 — Worker

- `POST /api/email-change/start` și `/finalize` (autentificate cu tokenul utilizatorului, ca `region-move`):
  revendică noul email în D1 (respinge cu `wrong_region:<r>` dacă e al celeilalte regiuni), eliberează vechiul
  după confirmare, anulează rezervarea dacă omul renunță.
- `createTargetAuthUser` primește parola opțională (mutarea de regiune). Parola nu se loghează nicăieri.
  Înainte de mutare, Worker-ul o verifică pe sursă (`/auth/v1/token?grant_type=password`).
- Joburile cron: curățarea conturilor care nu și-au confirmat niciodată emailul (nu se șterg singure în
  Supabase și ocupă emailul în D1): după 7 zile se șterg din `auth.users` și se eliberează cheia din D1.

### Faza 3 — Nucleul clientului

- `lib/auth/passwordAuth.ts`: `signUpWithPassword`, `signInWithPasswordAcrossRegions` (regiunea activă, apoi
  cealaltă; la succes pe cea opusă: `setActiveRegion` + reload), `requestPasswordReset` (pe ambele regiuni),
  `verifyEmailCode`, `resendConfirmation`.
- `isPasswordAuthEnabled()` (flag), componentă Turnstile (script `challenges.cloudflare.com`, randare
  explicită; un token e de unică folosință, deci un al doilea apel — regiunea a doua, resetare pe două
  regiuni — cere token nou).
- Mesaje de eroare traduse din codurile GoTrue (`invalid_credentials`, `email_not_confirmed`,
  `over_request_rate_limit`, `weak_password`, `captcha_failed`, `wrong_region:<r>`).

### Faza 4 — Pagini

`/login` (formular + Google + „Forgot password?” + link către `/signup`), `/signup`, `/forgot-password`,
`/reset-password`, `/auth/confirm` (cod sau `token_hash`; pagină intermediară cu buton, ca scanerele de linkuri
să nu consume tokenul), `/terms`, `/privacy`. Toate sunt export static, deci `useSearchParams` stă în Suspense.

### Faza 5 — Callback și sesiune

- Scos `dropStrayEmailIdentity` din `/auth/callback`; la „Switch Google account” se păstrează curățarea doar
  pentru identitatea `email` creată ca efect lateral de Admin API, nu pentru parola reală a omului.
- Logica de după login (`checkAccountMoved`, `cancelPendingAccountDeletion`, redirect către onboarding) devine
  o funcție comună, folosită și de login cu parolă și de confirmarea emailului.

### Faza 6 — Setări

„Linked to Google” devine „Sign-in methods”: parolă (setează, schimbă, eliminată doar dacă mai există Google),
Google (leagă, deleagă, schimbă contul), email (schimbă, prin Worker). Nu se poate elimina ultima metodă.

### Faza 7 — Mutarea de regiune

Pasul „introdu parola” doar pentru conturile cu identitate `email`. Cont cu ambele metode: cere parola.

### Faza 8 — Documentație

Actualizat `docs/MULTI_REGION_ARCHITECTURE.md`, `supabase/MIGRATION_PARITY.md` și memoria proiectului.

## Cazuri-limită (fiecare trebuie să fie acoperit)

**Înscriere.** Email deja existent (mesaj neutru, nu se dezvăluie nimic). Înscriere repetată pe un cont neconfirmat
(se retrimite codul; `max_frequency` 1 minut). Email greșit scris (contul rămâne neconfirmat, ocupă cheia în D1,
de aceea curățarea din Faza 2). Emailul aparține celeilalte regiuni (hook-ul respinge cu `wrong_region:<r>`;
clientul comută regiunea și spune omului să se logheze acolo). Parolă slabă (mesajul spune regula).
Brevo a atins plafonul de 300/zi (mesaj „încearcă mai târziu”, nu o eroare neexplicată).

**Login.** Parolă greșită, email neconfirmat (arată „introdu codul”/„retrimite”), cont creat cu Google fără parolă
(același mesaj generic ca parola greșită), cont mutat în cealaltă regiune (flux `account_moved` existent),
cont cu ștergere programată (se reactivează, ca acum), cont retras (`retired_to_region`) care încă acceptă
parola veche. Rate limit atins.

**Resetare parolă.** Email inexistent (același mesaj „dacă există cont, ai primit un email”). Cont Google-only
(poate seta o parolă prin resetare, consecvent cu „ambele metode”). Link deschis în alt browser sau consumat de
un scaner (de aceea butonul intermediar și codul). După resetare: `signOut({ scope: "others" })`.

**Conturi legate.** Același email prin Google și parolă = un singur cont (Supabase leagă identitățile cu email
verificat; se testează pe live înainte de lansare). Omul își pierde accesul la Google: are parolă. Aceeași
persoană cu două emailuri diferite = două conturi; nu le unim automat.

**Regiune.** Utilizator din US pe aplicația EU. Cont mutat și parola reintrodusă. Cont mutat unde parola veche
mai merge în regiunea retrasă.

**Securitate.** Turnstile pe fiecare cerere sensibilă. Rate limit-uri Supabase. Parolele nu apar în log-uri,
URL-uri sau analytics. Emailul de confirmare conține doar codul și linkul, nu parola.

## Urmăriri (neluate acum)

- `emailKey()` din Worker nu normalizează alias-urile Gmail (`a.b@gmail.com` = `ab@gmail.com`,
  `+tag`); poate duce la două conturi pentru aceeași căsuță.
- Blocare de emailuri de unică folosință (disposable).
- Coloană „metodă de login” în panoul de admin.
- MFA / passkeys; „Remember me”.
- Dacă 300 emailuri/zi devin insuficiente: Brevo plătit, sau Cloudflare Email Service (cere Workers Paid).

## Starea implementării

Actualizat 2026-10-04. Tot codul de mai jos e în repo (`sandbox`) și ascuns în spatele
`NEXT_PUBLIC_PASSWORD_AUTH`; nimic din ce urmează nu se vede în producție până nu pornești flag-ul.

| Faza | Stare |
|---|---|
| Dashboard (utilizatorul) | **de făcut** — vezi lista de mai sus |
| 1 DB | **aplicată 2026-10-05 pe EU și US**, cu rândul de ledger (`supabase/migrations/20261004184744_password_auth_relax_gmail_rule.sql`). Verificat după aplicare: triggerul și constrângerea vechi dispărute, `on_auth_identity_require_gmail` și `has_password()` prezente, `handle_new_user()` păstrează trial-ul Pro, cele 8 conturi EU neatinse |
| 2 Worker | scris și testat local: `worker/lib/emailChange.ts`, `accountSweep.ts`, parolă la mutare; **nedeployat**, iar tabelul D1 `0004_email_changes.sql` **neaplicat** (scrierea pe D1-ul remote a fost blocată de clasificator) |
| 3 Nucleu client | gata (`lib/auth/passwordAuth.ts`, `finishSignIn.ts`, `useAuthRegion.ts`, `app/components/auth/*`) |
| 4 Pagini | gata: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/confirm`, `/terms`, `/privacy` (textele legale sunt DRAFT) |
| 5 Callback | gata: `finishSignIn` comun, `dropStrayEmailIdentity` doar la „Switch Google account”, `?link=1` |
| 6 Setări | gata: parolă (adaugă/schimbă), email (schimbă prin Worker), legare Google pentru conturile cu parolă |
| 7 Mutare regiune | gata: parola se cere și se transmite Worker-ului doar la crearea contului țintă |
| 8 Documentație | acest fișier; secțiunea din `docs/MULTI_REGION_ARCHITECTURE.md` |

Verificat: `tsc` (app + Worker) curat, `next build` (export static) trece cu toate rutele noi prerandate, lint
fără erori noi, paginile randate în browser (desktop și 375px, fără scroll orizontal), validările de formular,
migrația SQL pe un Postgres local (inclusiv `has_password()`). Worker-ul testat local (`wrangler dev --local`, D1
local, Supabase simulat): schimbarea emailului (start/finalize/cancel, inclusiv email deținut de cealaltă
regiune, claim preexistent care nu trebuie eliberat, anulare după confirmare, mutare de regiune în curs) și
job-ul săptămânal de curățare (șterge doar conturile neconfirmate, fără sign-in, cu identitate doar `email`,
mai vechi de 7 zile; nu atinge confirmate, Google, recente). **Neverificat cap-coadă**
(nu se poate până nu există SMTP, provider Email și Turnstile): o înscriere reală, primirea emailului, codul și
linkul, resetarea parolei, schimbarea emailului, mutarea unui cont cu parolă, comportamentul Supabase când
același email există și pe Google.

## Ce rămâne în mâna ta (nu am putut sau nu trebuie să fac eu)

**Ordinea contează**: 1 (migrația) și 2 (D1 + deploy) înainte de pașii din Dashboard, iar flag-ul la urmă.
Cu flag-ul pornit și fără migrație, Setări nu poate afla dacă un cont are parolă (`has_password()` lipsește).

1. ~~Migrația Postgres pe EU și US~~ — **făcută 2026-10-05** (ledger și `MIGRATION_PARITY.md` la zi). Fișierul
   SQL e încă necomis în git.
2. **D1**: `wrangler d1 execute vici-sensei-accounts --remote --file=worker/migrations/0004_email_changes.sql`,
   apoi **deploy** (`npm run deploy`) ca endpoint-urile noi să existe.
3. Pașii din Dashboard de mai sus, apoi flag-ul.
4. **Textele `/terms` și `/privacy`** și adresa de contact (`LEGAL_CONTACT` în
   `app/components/auth/LegalPage.tsx`): sunt un draft scris din ce face aplicația, nu sfat juridic.
5. Un test cap-coadă pe un email real, în ambele regiuni, înainte să anunți funcția.

## Detalii de proiectare descoperite pe parcurs

- `handle_new_user()` a fost modificat după baseline (trial Pro de 7 zile, `premium_until`): migrația pornește
  de la versiunea LIVE, nu de la cea din baseline, altfel ar fi anulat trialul.
- Un cont creat cu parolă primește același trial de 7 zile ca unul Google, din momentul înscrierii (nu al
  confirmării): cu emailuri de unică folosință se poate „cultiva” trialul. Miza e mică; de reținut.
- Verificarea parolei curente (schimbare parolă/email, mutare de regiune) e un `signInWithPassword` real, deci
  cere un token Turnstile ca orice login.
- `has_password()` (RPC `SECURITY DEFINER`) există fiindcă obiectul `User` nu spune dacă are parolă.
