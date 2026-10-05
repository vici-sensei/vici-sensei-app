# Pașii din Dashboard pentru login cu email și parolă

Ghid simplu, în ordine. Contextul și motivele sunt în `docs/PASSWORD_AUTH_PLAN.md`. Numele butoanelor din
Supabase, Brevo și Cloudflare se mai schimbă; dacă nu găsești exact un nume, caută ceva asemănător.

**Înainte de orice:** tabelul D1 (`0004_email_changes`) și migrația Postgres sunt făcute deja, iar codul e
publicat. Aici rămân doar configurările din site-urile externe.

Ai nevoie de patru conturi: Brevo (nou, gratuit), Cloudflare (îl ai), Supabase (îl ai, cu ambele proiecte) și
GitHub (îl ai).

---

## A. Brevo: serviciul care trimite emailurile (gratuit, 300 pe zi)

1. Fă un cont pe brevo.com (gratuit, fără card). Brevo poate cere să-ți confirmi contul sau să răspunzi la
   câteva întrebări înainte să te lase să trimiți.
2. Mergi la **Senders, Domains & Dedicated IPs → Domains** și adaugă domeniul `vici-sensei.com`.
3. Brevo îți arată câteva înregistrări DNS (de obicei un TXT de verificare, două CNAME pentru DKIM și un TXT
   pentru DMARC). Intră în Cloudflare → domeniul `vici-sensei.com` → **DNS → Records** și adaugă-le exact cum
   sunt. La CNAME-uri pune norișorul pe **„DNS only”** (gri), nu „Proxied” (portocaliu).
4. Înapoi în Brevo, apasă **Authenticate** până domeniul apare ca verificat. Poate dura de la câteva minute la
   câteva ore.
5. Mergi la **SMTP & API → SMTP** și creează o **cheie SMTP**. Notează-ți trei lucruri, le folosești la pasul C:
   - serverul: `smtp-relay.brevo.com`, portul `587`;
   - **login-ul SMTP** (arată ca un email, de ex. `abc123@smtp-brevo.com`);
   - **cheia SMTP** (parola; Brevo ți-o arată o singură dată).

## B. Turnstile: verificarea „nu ești robot” (gratuit)

1. În Cloudflare mergi la **Turnstile → Add widget**.
2. Nume: `vici-sensei`. La domenii adaugă `app.vici-sensei.com` și `localhost`. Mod: **Managed**.
3. Creează-l și notează-ți două lucruri:
   - **Site key** (public, merge în aplicație);
   - **Secret key** (secret, merge în Supabase).

## C. Supabase: de făcut pe fiecare proiect, EU întâi, apoi US

Repetă tot ce urmează, în ordine, pe **EU** și apoi pe **US**. Singura diferență între ele e un cuvânt în
șabloanele de email (vezi secțiunea „Șabloanele”).

1. **Authentication → Emails → SMTP Settings** (sau „SMTP Settings”):
   - activează **Custom SMTP**;
   - sender email: `no-reply@vici-sensei.com`, sender name: `Vici Sensei`;
   - host `smtp-relay.brevo.com`, port `587`;
   - username = login-ul SMTP de la Brevo, password = cheia SMTP.
2. **Authentication → Rate Limits**: ridică „emails sent per hour” de la 30 la `100`.
3. **Authentication → Sign In / Providers → Email** (sau „Providers → Email”):
   - **Enable Email provider**: PORNIT;
   - **Confirm email**: PORNIT;
   - **Secure email change**: OPRIT;
   - **Secure password change**: OPRIT;
   - **Email OTP length**: `6`.
4. Tot acolo, la regulile parolei (sub Email sau „Password”): **Minimum password length** = `10` și cerința
   **„Letters and digits”** (litere și cifre).
5. **Authentication → URL Configuration**:
   - **Site URL**: `https://app.vici-sensei.com`;
   - la **Redirect URLs** adaugă: `https://app.vici-sensei.com/auth/confirm` și
     `http://localhost:3000/auth/confirm` (cele existente rămân).
6. **Authentication → Emails → Templates**: înlocuiește conținutul a trei șabloane cu cele de mai jos:
   **Confirm sign up**, **Reset password**, **Change email address**. Pune și subiectul indicat.
7. **Authentication → Attack Protection** (sau „Bot and Abuse Protection”): pornește **CAPTCHA protection**,
   alege **Cloudflare Turnstile** și lipește **Secret key** de la pasul B.

> Atenție: cu Captcha pornit în Supabase, aplicația trebuie să aibă și site key-ul (pasul D). Dacă pornești
> `NEXT_PUBLIC_PASSWORD_AUTH=true` fără `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, înscrierea și login-ul cu parolă
> vor eșua. Loginul cu Google nu e afectat de Captcha. Cât timp flag-ul e oprit, nimic nu se vede și nu se rupe.

## D. Cheile în aplicație

1. **GitHub** → repo `vici-sensei-app` → **Settings → Secrets and variables → Actions → New repository
   secret**. Adaugă două secrete:
   - `NEXT_PUBLIC_PASSWORD_AUTH` cu valoarea `true`;
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` cu **Site key** de la pasul B.
2. Pentru testat local, în `.env.local` adaugă aceleași două linii:
   ```
   NEXT_PUBLIC_PASSWORD_AUTH=true
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site key>
   ```
3. Publică din nou (un push pe `main` face asta singur; sau `npm.cmd run deploy` de pe calculatorul tău).
   Cheile se citesc la build, deci fără o publicare nouă nu au efect.

## E. Testul final, cu un email real

1. Pe `https://app.vici-sensei.com/signup` fă un cont cu un email la care ai acces (poate fi și Outlook).
2. Ar trebui să-ți ajungă un email cu un cod de 6 cifre și un buton. Verifică și dosarul Spam.
3. Introdu codul (sau apasă butonul, chiar și într-un alt browser). Ar trebui să ajungi în onboarding, unde ți
   se cere numele.
4. Ieși din cont și intră cu email și parolă. Apoi încearcă „Forgot password?”.
5. Din **Settings → Profile**: schimbă parola, apoi schimbă emailul.
6. Fă același test în regiunea Americas (selectorul de pe pagina de login).
7. În Brevo, la **Statistics**, vezi dacă emailurile au fost livrate.

Dacă ceva nu merge, nu schimba setări la întâmplare: scrie-mi exact ce vezi pe ecran.

## F. Verificarea lunară care ține cheia Brevo în viață (heartbeat)

Cheia SMTP de la Brevo expiră după 90 de zile fără nicio utilizare. Worker-ul trimite o dată pe lună, pe 1 la
05:00 UTC, un email scurt prin același server Brevo, cu aceeași cheie, ca să nu expire. Codul e în
`worker/lib/smtpHeartbeat.ts`. Are nevoie de cheia pusă și ca secret în Worker (a doua copie). **Nu o
scrie în chat și nu o pune în fișiere din proiect.**

1. După ce codul e publicat, rulează trei comenzi, una după alta. La fiecare, terminalul îți cere valoarea
   și o lipești acolo (nu apare pe ecran):
   ```bash
   npx.cmd wrangler secret put SMTP_USER
   ```
   ```bash
   npx.cmd wrangler secret put SMTP_PASSWORD
   ```
   ```bash
   npx.cmd wrangler secret put HEARTBEAT_EMAIL_TO
   ```
   - `SMTP_USER`: login-ul SMTP de la Brevo (se termină în `@smtp-brevo.com`);
   - `SMTP_PASSWORD`: cheia SMTP;
   - `HEARTBEAT_EMAIL_TO`: adresa ta, unde vrei să primești emailul lunar.
2. Cât timp lipsește oricare dintre ele, jobul nu face nimic și scrie „skipped” în jurnal.
3. **Cum verifici că merge:** în Brevo, la **SMTP & API → SMTP**, coloana **Last used on** a cheii se
   actualizează, iar emailul „Vici Sensei: monthly email check” îți ajunge în inbox. Rezultatul fiecărei rulări
   se vede și în baza D1, în tabelul `reconciliation_log` (`smtp_heartbeat` = reușit, `smtp_heartbeat_error` =
   a eșuat, cu motivul).
4. **Test imediat, fără să aștepți luna viitoare:** adaugă cele trei valori în fișierul `.dev.vars` din
   rădăcina proiectului (e ignorat de git), apoi rulează
   ```bash
   node node_modules/wrangler/bin/wrangler.js dev --local --port 8788
   ```
   și deschide în browser `http://127.0.0.1:8788/cdn-cgi/local/scheduled?cron=0+5+1+*+*`. Emailul trebuie să
   ajungă în câteva secunde. Apoi oprești serverul cu Ctrl+C și ștergi cele trei linii din `.dev.vars`.

Dacă emailul lunar nu mai vine, înseamnă că ceva s-a stricat la trimitere: verifică jurnalul de mai sus și,
dacă cheia a expirat, creează alta în Brevo și pune-o în Supabase (EU și US) și în `SMTP_PASSWORD`.

---

## Șabloanele

Pe **EU** le folosești exact ca mai jos. Pe **US** înlocuiești `region=eu` cu `region=us` (apare o singură dată
în fiecare șablon). Nu schimba restul: `{{ .Token }}`, `{{ .TokenHash }}`, `{{ .RedirectTo }}` le completează
Supabase.

### Confirm sign up

Subiect: `Your Vici Sensei confirmation code`

```html
<h2>Confirm your email</h2>
<p>Your code is:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Or <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email&region=eu">confirm in one click</a>
   (it works from any browser).</p>
<p>If you didn't create an account, you can ignore this email.</p>
```

### Reset password

Subiect: `Reset your Vici Sensei password`

```html
<h2>Reset your password</h2>
<p>Your code is:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Or <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery&region=eu">choose a new password</a>
   (it works from any browser).</p>
<p>If you didn't ask for this, you can ignore this email. Your password stays the same.</p>
```

### Change email address

Subiect: `Confirm your new Vici Sensei email`

```html
<h2>Confirm your new email address</h2>
<p>Your code is:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Or <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email_change&region=eu">confirm in one click</a>.</p>
<p>If you didn't ask to change your email, you can ignore this message.</p>
```
