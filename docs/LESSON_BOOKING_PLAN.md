# Programări la lecții (calendar) — plan

**Stare: plan, fără cod.** Deciziile de mai jos au fost luate în sesiunea din 2026-10-08, printr-un set de
întrebări cu variante. Nimic din acest document nu e aplicat în vreo bază de date. Punctele marcate
„de verificat" sunt presupuneri despre cod/infrastructură care nu au fost citite încă.

## 1. Ce construim

Lecții săptămânale de japoneză, în grupuri de maximum 3 elevi, ținute de profesori. Adminii aleg orele
(în ora New York). Fiecare user vede orele în fusul lui. Elevul alege o dată o clasă fixă și vine în
fiecare săptămână; o poate schimba oricând, fie doar pentru o săptămână, fie de acum încolo.

Scara estimată pentru primul an: mică (sub ~30 elevi, 1-3 profesori, sub ~15 clase/săptămână). Nu e nevoie
de o bibliotecă de calendar (vezi §10).

## 2. Date și concurență

- **Scriitor unic global.** Toate scrierile de locuri trec printr-un singur proiect Postgres. Pornește în
  **EU** (la 2026-10-08: 8 din 9 useri în EU, toți 9 din RO/`Europe/Bucharest`, ambii admini în EU).
  Useri din America sunt așteptați în curând: ei plătesc ~100-150 ms în plus doar la clickul de rezervare.
  Locația scriitorului e o configurație și se poate muta printr-o migrare; alegerea nu limitează ce
  regiuni au useri.
- **Scrierile trec prin Worker, nu prin FDW.** Worker-ul (`worker/lib/lessons.ts`) verifică JWT-ul în
  regiunea elevului, citește fresh rolul (`users.admin`, `users.is_teacher`) și fusul
  (`user_study_settings.timezone`) din aceeași regiune cu service role, apoi apelează UN RPC al
  scriitorului, executat într-o singură tranzacție în EU. Variantele cu `postgres_fdw` (cum scrie
  `kw_push` sau `admin_set_student_premium`) ar costa o rundă transatlantică pe fiecare instrucțiune
  dintr-o rezervare. Scriitorul nu vede niciodată un JWT: RPC-urile lui sunt doar `service_role`.
- **Citirea locală în US (replica) NU e făcută în etapa 1** și rămâne o decizie deschisă, vezi §13. Până
  atunci elevii din US citesc și scriu prin Worker → EU (~100-150 ms), același cod ca pentru EU.
- **Elevii văd doar contoare** (locuri ocupate/libere), nu și colegii.
- **Garanția anti-suprarezervare** nu e o simplă `UNIQUE(seat_no)`: înscrierile fixe sunt valabile pentru
  orice săptămână viitoare și nu pot fi materializate ca rânduri-loc. Garanția vine din:
  1. toate scrierile trec prin RPC-uri `SECURITY DEFINER` în scriitor (`lessons.*` nu are nicio GRANT,
     `public.lesson_*` sunt executabile doar de `service_role`);
  2. **un singur lock consultativ global** (`lessons.lock()`) luat de fiecare mutație (scara e mică, o
     rezervare durează milisecunde, un singur lock nu poate face deadlock și nu poate fi uitat pe o cale
     de cod; la o scară mult mai mare se înlocuiește cu lock-uri per clasă luate în ordine fixă). Asta
     înlocuiește ideea inițială „lock pe (clasă, ocurență) și pe elev";
  3. numărarea și scrierea în aceeași tranzacție, cu verificare după scriere (`assert_capacity`).
  Testat local cu 12 conexiuni simultane pe 3 locuri, de 4 ori, pentru înscrieri fixe, mutări singulare și
  amestec: exact 3 reușite de fiecare dată.
  Ocurențele (clasă + dată NY) se calculează din șablon și se salvează doar când au o rezervare, o
  excepție sau o mutare. Locurile, anulările și lista de așteptare lucrează pe **ocurență**, deci nu
  depind de nicio definiție de săptămână; săptămâna intră doar în cotă, în „mută doar săptămâna asta" și
  în afișare (vezi §3).
- **Capacitatea nu e limită dură pentru admin.** Adminul/profesorul poate trece peste cotă, timp și
  capacitate, cu confirmare explicită și intrare în jurnal (`is_override`). Calea elevului respectă
  capacitatea strict.
- **Mutarea contului între regiuni (decis):** înscrierea fixă și listele de așteptare **se mută automat** pe
  contul nou. O mutare de regiune creează un cont cu UID nou, deci mutarea trebuie să re-indice rândurile
  din scriitor (sau să le lege de o cheie care supraviețuiește mutării). La ștergerea contului locurile se
  eliberează.

## 3. Timp, fus orar, DST

- Clasa = (zi, oră locală, `America/New_York`, durată). Instantul se calculează cu `AT TIME ZONE
  'America/New_York'`. Ora NY rămâne fixă; ora elevului se mută la schimbările DST (SUA și Europa se
  schimbă la date diferite, deci apar câteva săptămâni cu diferență de 1h).
- **Săptămâna = săptămâna elevului, în fusul lui** (revizuit după prima variantă „săptămâna NY", care
  număra o lecție într-o săptămână diferită de cea din grid). Începe și se termină la 00:00 în fusul
  elevului. **Prima zi a săptămânii o alege elevul în setări** (implicit luni); schimbarea se aplică de
  la săptămâna următoare, ca fusul. Seatele nu depind de săptămână (§2).
- **Fus de afișare:** cel salvat în cont (`user_study_settings.timezone` + `preferred_timezone`), cu
  suprascriere manuală. Chip „Times shown in …" cu buton de schimbare. Când fusul se schimbă automat
  (călătorie), elevul primește notificare.
- **Fusul care definește săptămâna pentru cotă** e cel salvat, dar o **schimbare de fus se aplică de la
  săptămâna următoare** (afișarea se schimbă imediat). Împiedică mutarea granițelor ca să iei o lecție în
  plus. Writer-ul are nevoie de fusul salvat al elevului (copie sincronizată; de proiectat), nu de unul
  trimis de client.
- **Adminul și profesorul** își văd săptămâna în fusul propriului cont, ca orice user. Rosterul pe ocurență
  nu depinde de săptămână.
- **Săptămâni cu 0 sau 2 lecții din cauza DST (decis: cota numără lecțiile reale din săptămâna elevului).**
  Exemplu: clasă „duminică 17:30 New York", elev în București, luni-duminică, 2026: lecțiile cad luni 2 mar
  00:30, dum. 8 mar 23:30 (săptămâna 2-8 mar = **2 lecții**), apoi 15 și 22 mar la 23:30, iar cea din
  29 mar ajunge luni 30 mar 00:30 (săptămâna 23-29 mar = **0 lecții**). Toamna: 19-25 oct = 2, 26 oct-1 nov
  = 0. Reguli:
  - cu **0** lecții în săptămână, elevul are cota liberă și își poate alege orice clasă liberă;
  - cu **2**, nu poate adăuga, dar poate înlocui oricare dintre ele;
  - înscrierea fixă nu e niciodată blocată de cotă; „mută doar săptămâna asta" înlocuiește ocurența clasei
    fixe afișată în aceeași săptămână locală;
  - calendarul marchează aceste săptămâni („2 lecții din cauza schimbării orei").
- **Nu există regulă lunară** („4 pe lună" e doar consecința a ~1 lecție/săptămână). Într-o lună cu 5
  ocurențe elevul vine la toate 5; nu există limită lunară.
- **Ziua se schimbă la 00:00 în fusul userului** (nu la 6:00 ca la studiu, `study_day`). Calendarul își
  reia „azi" la miezul nopții local chiar dacă tab-ul rămâne deschis.
- Ore de șablon interzise în UI admin: duminică 01:00-02:59 NY (ora nu există sau se repetă).
- Se stochează șablonul și se calculează instantele; instantele materializate se pot recalcula dacă se
  actualizează baza de fusuri orare (rar).

## 4. Roluri și drepturi

- **Profesor:** coloană nouă booleană `is_teacher` pe `public.users`, setată de admin din aplicație (nu
  editabilă de user). Același tipar ca `admin_set_student_premium`, deci migrare pe ambele regiuni plus
  oglinda admin (de verificat în `MIGRATION_PARITY.md`).
- **Dreptul de a se înscrie nu are legătură cu Pro.** Îl decid adminul și profesorii, manual, din lista de
  elevi. Fără flux „cere acces" și fără conversie automată din `free_lesson_leads`.
- Pe fiecare elev, setat de admin/profesor:
  - **acces** (da/nu) cu **dată de sfârșit opțională**: locurile rezervate după acea dată se pierd;
  - **poate muta** (da/nu): dacă e „nu", locurile deja rezervate se păstrează, dar elevul nu le mai schimbă;
  - **cota** de lecții pe săptămână (implicit 1), la **clase diferite**; cota o poate seta și profesorul.
- **Admin:** creează/modifică clase, vacanțe, atribuie profesori; poate toate acțiunile profesorului.
- **Profesor:** vede lista elevilor din clasele lui, anulează sau mută o ședință din clasele lui, setează
  cota unui elev, marchează prezența. Nu creează clase și nu modifică șablonul. Un profesor per clasă;
  înlocuitor doar pe o ședință.
- **Un cont de profesor nu poate fi elev** (rolurile sunt separate; adminul poate schimba flag-ul).
- **Absențele** marcate de profesor se doar înregistrează, fără automatizări.
- **Link-ul de întâlnire** îl văd doar elevii înscriși la acea ocurență, profesorul și adminii; verificat în
  DB (RPC/RLS), nu doar ascuns în UI.
- Fără limită de timp pentru elev: poate rezerva, muta, anula **până la începutul clasei**.

## 5. Regulile elevului

- Alege o **clasă fixă** (o dată) și vine în fiecare săptămână.
- **Două acțiuni separate în UI:** „mută doar săptămâna asta" și „schimbă clasa mea fixă".
- Poate face o mutare singulară pentru **orice săptămână viitoare**.
- **Nu există „sar peste o săptămână":** trebuie să se mute la altă clasă sau să-și anuleze înscrierea fixă.
- **Clasă anulată de admin/profesor:** fără credit de recuperare; în aceeași săptămână elevul poate alege
  altă clasă liberă.
- **Clasă plină:** listă de așteptare pentru **înscriere fixă și pentru mutări singulare**.
  - Când se eliberează un loc, **toți** cei de pe listă primesc notificare cu buton „Confirmă".
  - **Primul care confirmă** primește locul (decide scriitorul unic; la confirmare se reverifică acces,
    cotă și dacă locul e încă liber).
  - Dacă mutarea îl scoate peste cotă, notificarea spune că va fi mutat din clasa X în clasa Y și motivul.
    Elevul poate refuza.
  - Fără ordine de coadă: e „urmărește clasa", câștigă cine confirmă primul.

## 6. Clasa ca obiect

Zi + oră NY + profesor + **nivel/subiect** (etichetă informativă, nu restricționează) + **link de
întâlnire** (suprascriibil pe o ședință) + **durată configurabilă** + **capacitate configurabilă**
(implicit 3, maximum 3 pentru elevi).

- **Editare/ștergere șablon:** adminul alege la fiecare modificare între „se aplică de la o dată aleasă,
  elevii se mută automat și sunt notificați" și „locurile se eliberează, elevii aleg din nou". Șablonul are
  deci versionare pe date (`valid_from`/`valid_until`); trecutul rămâne neschimbat.
- **Excepții pe o singură ședință:** anulare, mutare, schimbare profesor, ședință unică nerecurentă.
- **Schimbarea orei unei clase existente:** notificare imediată + marcaj în calendar pe ocurența afectată
  (vechea și noua oră); elevul poate alege altă clasă până la început. Nu cere confirmare.
- **Vacanțe:** interval definit de admin, global sau per profesor. Clasele afectate se anulează automat,
  elevii sunt notificați o singură dată, calendarul le arată ca „fără lecție".

## 7. Notificări

- **Canale:** în aplicație (banner + inbox), email, push web (PWA). Fără WhatsApp automat.
- **Schimbare de oră (DST NY sau fusul elevului):** avertizare cu **14 zile**, **7 zile** și **1-2 zile**
  înainte de prima clasă afectată, plus **marcaj permanent în calendar** pe săptămâna afectată. Se
  calculează din baza de fusuri orare, deci se știe cu mult timp înainte.
- **Mementouri:** cu 24 h, 1 h și 10 minute înainte (cel de 10 minute cu link-ul de întâlnire). **Elevul le
  poate opri pe tip și canal; nu poate opri anulările, schimbările de oră și avertizările DST.**
- Evenimente: anulare, mutare, schimbare profesor, vacanță, loc eliberat (lista de așteptare), schimbare
  de acces, schimbare automată a fusului.
- Trimiteri la momente exacte: job periodic (`pg_cron` există deja în proiect). Cheie de deduplicare
  (elev, clasă, săptămână, tip, avans). De verificat: expeditor tranzacțional pe `vici-sensei.com`
  (acum Brevo e folosit de Supabase Auth; există și un client SMTP mic în `worker/lib/smtpHeartbeat.ts`).
- Push: VAPID + service worker (există `scripts/generate-sw.mjs`); pe iPhone merge doar dacă PWA e instalată.

### Cum funcționează notificările (etapa 4, implementat)

- **Un singur loc care decide:** baza de date. `lessons.materialize_due()` (apelat de `lesson_scheduler_tick()`, din `pg_cron` la fiecare minut și, ca plasă de siguranță, din cron-ul Worker-ului la 5 minute) caută lecțiile din următoarele 14 zile și scrie ce e scadent ACUM. Cheia de deduplicare face ca a doua rulare să nu mai scrie nimic.
- **Mementouri (24 h / 1 h / 10 min):** pentru fiecare elev al lecției se scrie doar cel mai strâns prag deja atins (un elev care se înscrie cu 5 minute înainte primește doar „în ~10 minute”, nu trei mesaje deodată); niciodată după începerea lecției. Cheia conține instantul lecției, deci o lecție mutată primește din nou mementourile, la ora nouă. Cel de 10 minute conține linkul de întâlnire. Expiră la începutul lecției: un email rămas în coadă după aceea e sărit.
- **Avertizări DST (14 / 7 / 2 zile):** o lecție „se mută” dacă ora ei pe ceasul elevului diferă de aceeași clasă cu o săptămână înainte (ora din New York nu se schimbă niciodată; ora elevului da, când New York-ul sau țara lui schimbă ceasul). Se avertizează la prima lecție afectată, o singură dată pe etapă, doar etapa în care ne aflăm (un elev înscris cu o zi înainte primește doar avertizarea de 2 zile). Lecțiile mutate de profesor sau cu oră nouă de clasă nu sunt DST. Mesajul spune cu cât, din ce cauză (SUA, fusul elevului sau ambele) și că ora din New York nu se schimbă. Marcajul permanent din calendar există deja (etapa 2).
- **Comutatoare:** doar cele 3 mementouri × canalele „în aplicație” / email (push din etapa 5). Anulările, schimbările și avertizările DST nu se pot opri. Dacă toate canalele unui memento sunt oprite, nu se scrie nimic.
- **Livrare email:** cron-ul Worker-ului (`*/5 * * * *`, al 5-lea trigger — limita planului Free) cere coada la scriitor (`lesson_notifications_due`, cu lease de 10 minute ca două rulări să nu trimită același email), caută adresa în regiunea elevului, trimite totul într-o singură sesiune SMTP (Brevo, `no-reply@vici-sensei.com`, text UTF-8 în base64, subiect RFC 2047) și raportează fiecare rezultat: `sent`, `skipped` (fără adresă), `retry` (refuz temporar: până la 5 încercări, cu pauze de 10/20/30… minute), `failed` (permanent) sau `release` (serverul de email nu e accesibil sau loginul e refuzat: nu e vina mesajului, nu numără ca încercare). Fără `SMTP_USER`/`SMTP_PASSWORD` emailurile așteaptă; notificările din aplicație apar oricum. Până la 150 de emailuri pe rulare (3 × 50).
- **În aplicație:** clopoțel în bara paginii `/lessons` (număr necitite, la 60 s se reîmprospătează), inbox, tab „Reminders” cu comutatoarele și un banner sus pentru ce schimbă lecțiile (DST, anulare, mutare, profesor înlocuitor, vacanță, sfârșit de clasă/acces) până la „Got it”.

### Lista de așteptare (etapa 5, implementat)

- **Ce se poate aștepta:** o clasă plină (loc fix, săptămânal) sau o lecție plină (doar săptămâna aceea). Cel mult 3 intrări per elev. La înscriere elevul poate alege ce renunță dacă un loc se eliberează (altă clasă fixă, respectiv altă lecție din săptămână), pentru cazul în care cota e plină.
- **Cum se află că s-a eliberat un loc:** nu prin cârlige în fiecare funcție care poate elibera un loc (ieșire din clasă, mutare, sfârșit de acces, capacitate mărită, lecție restaurată...), ci prin `lessons.waitlist_sweep()`, care se uită la STAREA FINALĂ și rulează la sfârșitul oricărei tranzacții care a atins locuri (șase triggere constraint `deferrable initially deferred`, o singură rulare per tranzacție) și din `lesson_scheduler_tick`. O intrare e „armată” cât timp ținta e plină; prima dată când are loc, primește notificarea și se dezarmează; când locul dispare, se rearmează, deci următoarea eliberare o anunță din nou.
- **Primul care confirmă câștigă:** notificarea `waitlist_seat` pleacă către TOȚI cei care așteaptă locul; `lesson_waitlist_confirm` rulează codul normal de înscriere/mutare sub lock-ul global, deci acces, cotă, suprapuneri și locul în sine se verifică din nou. Cine întârzie primește `class_full` și rămâne pe listă. Testat cu 12 confirmări simultane pe 2 locuri libere: exact 2 câștigători.
- **Mesajul** spune dacă confirmarea îl mută dintr-o clasă în alta („You can have 1 weekly class, so confirming moves you from X to Y”) sau ce lecție înlocuiește. Elevul poate refuza („No thanks” scoate intrarea).
- **Curățenie:** intrările se șterg singure când elevul pierde accesul, lecția a început, clasa s-a încheiat sau elevul are deja ce aștepta.
- **În aplicație:** secțiune „This lesson is full” în dialogul lecției (în loc de cele două casete „full”), insignă „On the waitlist” pe card, banner cu „Confirm the seat” / „No thanks”. Adminul și profesorul văd cine așteaptă (`GET /api/lessons/staff/waitlist`, profesorul doar pentru clasele lui).

### Push web (etapa 5, implementat)

- **Criptare și autentificare:** `worker/lib/webPush.ts`, doar WebCrypto: RFC 8291 (ECDH P-256 + HKDF + AES-128-GCM, un singur record RFC 8188) și VAPID (RFC 8292, JWT ES256). Testat cu vectorul de test din RFC 8291 (corpul criptat coincide octet cu octet) și cu o decriptare ca a browserului.
- **Un elev, mai multe dispozitive** (max 5). Endpoint-ul vine de la browser, deci Worker-ul apelează doar gazde de push cunoscute (`*.googleapis.com`, Mozilla, Apple, Windows), doar prin https, fără port/credențiale: nu poate fi folosit ca SSRF.
- **Ce se împinge:** tot ce se trimite și pe email (mementourile respectă comutatorul „Push”). Coada are lease de 10 minute și reîncercări ca la email; un dispozitiv pe care serviciul de push îl declară dispărut (404/410) e șters.
- **Configurare (rămâne la tine):** `node scripts/generate-vapid-keys.mjs` → `VAPID_PUBLIC_KEY` (variabilă sau secret), `VAPID_PRIVATE_KEY` (secret: `wrangler secret put`) și `VAPID_SUBJECT` (`mailto:...`). Fără ele comutatorul „push” e ascuns și nu se trimite nimic; pagina primește cheia publică de la Worker (`GET /api/lessons/push/config`), deci nu e nevoie de variabilă la build. Service worker-ul (`scripts/generate-sw.mjs`) are handlerele `push` și `notificationclick`. Pe iPhone/iPad merge doar dacă aplicația e adăugată pe ecranul principal (pagina spune asta).


## 8. Vederi

Zi, săptămână, lună, an.

- **Zi:** lista orelor zilei locale, implicit pe telefon.
- **Săptămână:** grid cu 7 zile; vederea principală pentru alegerea clasei.
- **Lună:** lecțiile mele ca puncte/etichete; click duce la zi/săptămână.
- **An:** doar **navigație rapidă** spre lună/săptămână.
- Pentru elev: arată clasele disponibile și pe ale lui. Pentru admin/profesor: ocuparea și lista elevilor.

## 9. Google Calendar

Elevul **nu trebuie să poată modifica** evenimentele din Google. Decizie: **calendar deținut de aplicație**
(service account), un calendar per elev, partajat elevului doar cu drept de citire. Aplicația scrie
evenimentele, deci actualizările sunt imediate. Toți userii au Gmail (`users_email_gmail_check`).

De verificat la implementare: limitele de creare de calendare/ACL ale Google Calendar API, dacă elevul
trebuie să accepte partajarea manual, ce primește la Google în email, cum se trimit
mutările/anulările/trecerile DST (evenimente individuale vs. serie + excepții), unde se păstrează cheia
service account (secret Worker, nu în repo), ce se întâmplă la ștergerea contului elevului.

### Google Calendar (etapa 6, implementat și testat cu un Google simulat)

- **Cum arată:** în pagina `/lessons`, secțiunea „Google Calendar” (ascunsă cât timp serverul nu are cheia Google). Elevul apasă „Add to Google Calendar”; Worker-ul creează un calendar „Vici Sensei lessons” deținut de service account și îl partajează **doar cu drept de citire** cu adresa Gmail a contului lui (Google trimite invitația pe email; link „Open in Google Calendar” ca aliniere). „Stop” șterge calendarul.
- **Evenimente individuale** (nu serie recurentă): fiecare lecție se poate anula/muta singură, iar trecerile DST se rezolvă de la sine (fiecare eveniment are propriul instant). Titlu cu nivel, descriere cu linkul de întâlnire, `location` = link, `source` = aplicația, `guestsCanModify: false`. Fereastra: ieri + următoarele 8 săptămâni.
- **Cine ține ce:** scriitorul ține evidența (`lessons.google_calendars`: calendarul, `dirty_seq` crește la orice schimbare care poate atinge lecțiile; `lessons.google_events`: ce eveniment Google corespunde cărei lecții, cu hash). Worker-ul (`worker/lib/googleCalendarCore.ts`) cere `lesson_google_due` (ce trebuie să arate calendarul vs. ce arată), face diferența (creează / modifică / șterge) și raportează cu `lesson_google_done`. Rulează în jobul de 5 minute; o rulare fără nicio schimbare nu face niciun apel Google. Buget: 36 de apeluri pe rulare, 30 pe elev, 3 elevi pe rulare (limita de subrequesturi a Worker-ului).
- **Erori:** limita de rată (429 / 403 `rateLimitExceeded`) oprește rularea; 5xx și restul se înregistrează pe calendarul respectiv și se reîncearcă după 10, 20, 30… minute (maxim 4 h). Elevul nu poate șterge evenimentele (e doar cititor); dacă totuși un eveniment dispare din Google, reapare abia când lecția respectivă se schimbă.
- **Conturi:** un cont șters sau în așteptarea ștergerii își pierde calendarul (curățenia săptămânală, `sweepLessonAccounts`); o mutare de regiune păstrează calendarul (cheia se mută odată cu elevul, adresa rămâne aceeași).
- **De configurat (rămâne la tine):** un proiect Google Cloud cu Calendar API activat, un service account cu cheie JSON, apoi `npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON` și lipești tot fișierul JSON. Nu e nevoie de OAuth, de domeniu Workspace sau de variabile la build.
- **Ce nu s-a putut verifica fără cheie reală:** (1) dacă invitația apare automat în lista elevului sau cere un clic în email (pentru conturi Gmail obișnuite se așteaptă clicul din email; de aceea pagina îl spune); (2) formatul exact al linkului „cid” (se folosește forma cunoscută, base64 fără padding); (3) cotele reale de creare de calendare ale Google pentru un service account (se creează câte unul, la cererea elevului, cu pauză la limita de rată). Testele folosesc un Google simulat care verifică semnătura JWT RS256 și forma apelurilor.

## 10. Biblioteci

- **Nu** se folosește o bibliotecă de calendar UI (FullCalendar, react-big-calendar, Schedule-X). Ele nu
  cunosc locuri, cotă, săptămâna elevului sau mutări singulare, iar gridul zi/săptămână/lună/an e puțin cod în
  Tailwind. La scara aceasta e mai ieftin de întreținut decât de adaptat.
- **Dată/fus orar:** niciodată `Date` brut. Candidați: Temporal (cu polyfill) sau Luxon/`date-fns` cu
  suport de fus. De ales în implementare, cu verificarea compatibilității browserelor. Pe server,
  autoritatea e Postgres (`AT TIME ZONE`).

## 11. Livrare

Un singur lansabil cu toate cele patru grupuri (baza; excepții + notificări; listă de așteptare + push;
lună/an + Google + prezență), construit pe etape interne:

1. Schema + scriitorul + RPC-uri + Worker API; `is_teacher`. **Scris și testat local, apoi aplicat pe EU și US la
   2026-10-08** (repetiție în tranzacție anulată, apoi aplicare atomică cu rândul din ledger; vezi
   `supabase/MIGRATION_PARITY.md`). Worker-ul cu rutele `/api/lessons/*` e comis, dar abia se deployează la
   merge în `main`. Replica de citire în US: separat, §13.
   Integrarea cu mutarea de regiune: făcută în etapa 6 (vezi mai jos).
2. Calendarul elevului **(scris și testat local 2026-10-08; migrația `20261008081641` aplicată pe EU; Worker-ul încă nedeployat)**: pagina `/lessons` (săptămână și zi, fusul contului, săptămâna elevului, marcaj DST, dialog cu înscriere fixă / „doar săptămâna asta" / ieșire / anulare mutare, setarea primei zile a săptămânii, stările fără acces și profesor), `lib/lessons/*` (timp, reguli de afișare), `lib/client-data/lessons.ts`, numele profesorilor adăugate de Worker, migrația `20261008081641`. Lună și An rămân la etapa 6.
3. Admin/profesor: clase, excepții, vacanțe, liste, acces/cotă/mută. **Făcut 2026-10-08** (migrația `20261008103823` aplicată pe EU; panoul `/admin/lessons` și `/teach`; Worker `lessonsStaff.ts`). Fără interfață pentru: notificările și mementourile (etapa 4).
4. Notificări (în aplicație, email) și job-uri. **Făcut 2026-10-08** (migrația `20261008111342` aplicată pe EU; vezi „Cum funcționează notificările” în §7): mementouri, avertizări DST, inbox + banner + comutatoare, trimitere email din Worker (cron la 5 minute), `worker/lib/mailer.ts`. Push-ul web rămâne la etapa 5.
5. Listă de așteptare, push. **Făcut 2026-10-08** (migrațiile `20261008115636` și `20261008142512` aplicate pe EU; vezi „Lista de așteptare” și „Push web” în §7). Rămâne la tine: cheile VAPID (`node scripts/generate-vapid-keys.mjs`) ca secrete/variabile ale Worker-ului.
6. Lună/an, prezență, Google Calendar. **Făcut 2026-10-08** (migrațiile `20261008143943` și `20261008145017` aplicate pe EU): vederile Lună și An, lista de așteptare pentru staff, mutarea de regiune, curățenia conturilor șterse, Google Calendar. Prezența (marcată de profesor, vizibilă elevului) exista din etapa 3.

Migrațiile urmează regulile din `CLAUDE.md` / `MIGRATION_PARITY.md` (fișiere noi cu timestamp UTC, scop pe
prima linie, aplicate pe EU și US cu rândul din ledger; nimic pe proiectul înghețat).

### Lansare: linkul din meniu e în spatele `NEXT_PUBLIC_LESSONS`

Pagina `/lessons`, rutele Worker `/api/lessons/*` și migrațiile se deployează înaintea lansării, dar
**linkul „Lessons” din meniu apare doar când `NEXT_PUBLIC_LESSONS` este exact `true`** în momentul
build-ului (`lib/lessons/flag.ts`, același tipar ca `NEXT_PUBLIC_PASSWORD_AUTH`). Fără el, meniul e
identic cu cel de dinainte, iar pagina rămâne accesibilă doar prin URL (un elev fără acces vede că
lecțiile nu sunt deschise contului lui). Un elev care o deschide totuși creează un rând în
`lessons.students` (acces oprit).

- **Local:** `NEXT_PUBLIC_LESSONS=true` în `.env.local`, apoi repornești `next dev`.
- **Producție:** secretul GitHub `NEXT_PUBLIC_LESSONS` = `true` (Settings → Secrets and variables →
  Actions), apoi un nou deploy (orice push în `main` sau re-rularea workflow-ului „Deploy"). Se citește la
  build, deci schimbarea secretului singură nu face nimic.
- **Oprire:** ștergi secretul sau îl pui pe altceva decât `true`, și redeployezi.
- De pornit abia după etapa 3 (panoul de administrare: clase, profesori, acces), altfel elevii văd doar
  „Lessons aren't open for your account yet".

### Checklist de lansare (ce a rămas la tine; tot restul e făcut, testat și aplicat pe EU)

Tot codul e pe `sandbox`; `main` nu a fost atins. Migrațiile sunt deja aplicate pe baza EU (singura care are schema `lessons`), deci
deployul Worker-ului nu se mai uită la baza de date. În ordine:

1. **Merge `sandbox` → `main`** (deploy = site + Worker prin CI). De acum `/api/lessons/*`, jobul de 5 minute și mementourile
   rulează; fără nicio altă setare nu trimit email/push/Google (nu au chei), dar notificările din aplicație funcționează.
2. **Triggerele cron:** planul Cloudflare Free permite 5 per cont, iar acum sunt 5 (`wrangler.jsonc`). Dacă mai ai alt Worker cu cron pe
   același cont, deployul va fi refuzat până treci pe planul plătit sau scoți unul.
3. **Email (mementouri, anulări, avertizări DST, loc eliberat):** setează secretele Worker-ului `SMTP_USER` și `SMTP_PASSWORD`
   (aceleași ca la heartbeat-ul lunar; cheia Brevo). Fără ele emailurile așteaptă în coadă; notificările din aplicație merg oricum.
4. **Push web (opțional):** `node scripts/generate-vapid-keys.mjs`, apoi `VAPID_PUBLIC_KEY` (variabilă sau secret), `VAPID_PRIVATE_KEY`
   (secret: `wrangler secret put`) și `VAPID_SUBJECT` (`mailto:...`). Până atunci comutatorul „push” nu apare elevilor.
5. **Google Calendar (opțional):** vezi „De configurat” de mai sus (`GOOGLE_SERVICE_ACCOUNT_JSON`). Până atunci secțiunea nu apare.
6. **Datele:** din `/admin/lessons` → Students: marchezi profesorii (`is_teacher`), creezi clasele (Classes), dai acces elevilor (cu
   cotă/dată de sfârșit). Abia apoi pornești meniul: secretul GitHub `NEXT_PUBLIC_LESSONS=true` și un nou deploy.
7. **Replica de citire în US** (viteza pentru elevii din America): rămâne decizia din §13; nu blochează lansarea (elevii din US merg prin Worker → EU).

## 12. Valori implicite alese de Claude (nu au fost întrebate; de respins dacă nu convin)

- **Istoric:** lecțiile și prezențele se păstrează cât există contul; se șterg odată cu contul.
- **Listă de așteptare:** maximum 3 clase în același timp per elev.
- **Suprapuneri:** un elev cu cota 2 nu poate alege două lecții care se suprapun în timp.
- **Pagină fără acces:** elevul fără acces vede un mesaj scurt și un contact (link WhatsApp/email al
  adminului), fără buton de rezervare.
- **Limba:** engleză, ca restul aplicației (`lang="en"`, fără sistem de traduceri).
- **Format oră (12h/24h):** după localizarea browserului.
- **Note/teme după lecție:** nu în prima versiune.
- **Link de întâlnire:** fix pe clasă, suprascriibil pe o ședință.
- **Vacanțe:** intervalul se definește în date NY (ca șablonul) și se aplică pe ocurențe.

## 13. Întrebări încă deschise

- **Replica de citire în US** (viteza elevilor din America). Ce s-a aflat în cod: replicarea logică nativă
  merge doar cu același nume+schemă (`lb_export`), deci tabelele ar trebui create identic pe US; conexiunea
  cere parola DB a EU, introdusă manual de tine (ca la leaderboard), fără să intre în repo. Două variante:
  1. **Doar nepersonale:** `lessons.classes`, `lessons.class_versions` + un tabel nou de contoare de locuri
     materializate de scriitor. Elevul din US citește clasele local și apelează EU pentru „ale mele"
     (în paralel): câștig mic.
  2. **Plus rândurile proprii** (publicație cu filtru de rânduri `WHERE region = 'us'` pe
     `students`/`enrollments`/`moves`/`student_week_cfg`): citire 100% locală, dar o a doua funcție de citire
     (contoarele vin din tabelul materializat, nu din `seats_taken`) și logică de întreținut în două locuri.
  Se decide după ce se măsoară latența reală Worker → EU de la un edge american și cu elevi reali din US.
- ~~Integrarea cu mutarea de regiune~~ — făcută: pasul `update_ledger` din `regionMove.ts` cheamă `rekeyLessons` (idempotent, fără coloană nouă în D1).
- Cheia service account Google (vezi §9, „De configurat”).
