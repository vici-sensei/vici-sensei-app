# Plan: pagina `/admin/kanji-words` (adminii aleg cuvintele fiecărui kanji)

Stabilit pe 2026-10-07, într-o sesiune de întrebări cu utilizatorul. Documentul are patru părți: starea de
plecare verificată pe live, deciziile luate, designul (baza de date, `rebuild`, sincronizarea EU/US, pagina) și
fazele de livrare cu cazurile-limită. **Nimic din acest plan nu e scris în cod sau aplicat pe live încă.**

## Starea de plecare (verificată pe EU-nou, 2026-10-07, doar citire)

- Lista de cuvinte pe care o vede elevul vine din tabelul `kanji_detail_words (kanji_id, kanji_word_id, rank)`,
  citit de `get_kanji_detail_words`, `get_kanji_detail_words_batch`, `introduce_kanji` (prin prima),
  `get_new_kanji_candidates` (`word_count`) și două funcții de progres pe nivel (baseline, liniile ~597/634/1841).
- Tabelul e **golit și refăcut de la zero** (`truncate`) de `rebuild_kanji_detail_words()` la fiecare rulare.
  Orice editare directă în el s-ar pierde la următoarea rulare. De aceea editările adminului stau separat.
- 2229 de kanji, 26122 de legături `kanji_word`, 17349 de cuvinte în `vocabulary`. Lista curentă are 5189 de rânduri
  la 1964 de kanji; **265 de kanji nu au niciun cuvânt**. Medie 2,3 (N1) … 3,4 (N5) cuvinte, maximum 7.
- `kanji_word` e **completă**: nicio pereche (kanji, cuvânt din vocabular care îl conține) nu lipsește (0 din 26122).
  Adminul alege deci din candidații existenți și nu trebuie create legături noi. 143 de legături sunt către cuvinte
  cu `study_enabled = false` (ignorate oricum de `get_kanji_detail_words`).
- 27% din cuvintele alese (1387) și 59% din tot vocabularul (10211) **nu au nivel JLPT**. Algoritmul le tratează ca
  „peste N1” (rang 6). Filtrul „diferență de nivel” folosește aceeași convenție (decizia utilizatorului), deci:
  `gap = rang(nivel cuvânt, lipsă = 6) − rang(nivel kanji)`. Efect de știut: la un kanji N1 un cuvânt fără nivel
  are gap 1 (970 de cuvinte, 676 de kanji), iar „≥2” nu poate prinde niciun kanji N1. Valori reale azi: cuvinte cu
  gap ≥2 = 691, la 519 de kanji (dintre care doar 274 de cuvinte la 222 de kanji au nivel real).
- Reference data (`kanji`, `kanji_word`, `vocabulary`, `kanji_detail_words`) sunt identice pe EU și US. Proiectul
  vechi `hmbemylaqnkiamvhcdcd` e înghețat și nu se atinge.
- Cardurile existente (`user_kanji_reading_progress`, 64 de rânduri pe EU) nu sunt legate de `kanji_detail_words`:
  `get_due_cards` nu o verifică, deci un card deja introdus continuă să apară și după ce cuvântul iese din listă.

## Decizii (din întrebările cu utilizatorul)

| Subiect | Decizie |
|---|---|
| Model de date | **Strat de modificări** peste algoritm. Algoritmul scrie în tabelul lui, adminul doar „adaugă/scoate”. Lista finală = algoritm + modificări, reaplicată la fiecare `rebuild`. |
| Candidați | Orice cuvânt din `vocabulary` care conține kanji-ul (= `kanji_word`). Fără cuvinte noi create de admin. |
| Cuvinte `study_enabled = false` | Ascunse implicit, buton „Arată și cuvintele oprite”. În modul extins apar gri, nealegibile. |
| Sincronizare EU/US | **O singură acțiune scrie pe ambele regiuni**, prin FDW-ul existent (ca `admin_set_student_premium`). |
| Carduri existente la ștergere | Rămân neatinse. |
| Cuvânt adăugat la un kanji deja învățat | Nimic pentru elevii existenți; doar introducerile viitoare. |
| Limită de cuvinte | Fără limită (inclusiv 0). Avertisment vizibil peste 5. |
| Ordine | Automată, aceeași regulă ca acum. Adminul nu o schimbă. |
| „Originalul algoritmului” | **Doar rezultatul curent** (nu păstrăm copie înghețată de azi; decizie explicită a utilizatorului). Consecința: dacă `rebuild` rulează din nou, ce alesese algoritmul azi nu mai e în baza de date. Rămân istoricul modificărilor adminului și copiile zilnice ale listei finale. |
| Layout | Listă de kanji + panou de editare lateral (pe telefon, panou pe tot ecranul). |
| Salvare | Ciornă per kanji + buton „Salvează”, notă opțională. |
| Info la fiecare candidat | Furigana + sens (mereu), nivel JLPT + diferență, grup de citire + frecvență + „comun”, **de ce l-a ales/respins algoritmul**, câți elevi au deja cardul. |
| Acțiuni în masă | „Șterge cuvintele cu nivel +2 peste kanji” pe rezultatul filtrului, „Resetează la algoritm”, „Marchează ca verificat”. Toate cu previzualizare a numărului de modificări. |
| Filtre de conținut | Diferență de nivel (≥1/≥2/≥3), nivelul kanji-ului, număr de cuvinte (0,1,2,3,4+,peste 5), cuvinte fără nivel JLPT / necomune. |
| Filtre de stare | Modificat/neatins (plus „a primit”/„a pierdut” cuvânt), verificat/neverificat (plus „de re-verificat”), modificat recent/de cine, căutare text liber. |
| Pe ce listă filtrăm | Pe cea curentă; comutator „Filtrează pe lista algoritmului”. |
| Reversibilitate | Istoric per kanji + restaurare la orice versiune, reset la algoritm per kanji, anulare a unui lot, restaurare globală la o dată/oră. Restaurarea creează mereu o versiune NOUĂ (istoricul nu se rescrie). |
| Garanție | Jurnal **append-only impus de baza de date** (fără UPDATE/DELETE/TRUNCATE, nici pentru admini) + copie zilnică a listei finale. |
| Concurență | A doua salvare e refuzată cu „s-a schimbat în timp” (număr de versiune per kanji). |
| Algoritmul rulează din nou | Modificările adminului se reaplică; kanji-ul editat/verificat a cărui listă de algoritm s-a schimbat pierde „verificat”, primește steagul „algoritmul s-a schimbat” și apare la „de re-verificat”. |
| Extra în editor | Revenire per cuvânt (↺), previzualizare „cum vede elevul” (carduri +/− față de acum), bară de progres a verificării (pe niveluri). |
| Pagină / rută | `/admin/kanji-words`, titlu „Kanji words”, placă pe `/admin` cu **numărul de kanji de verificat** (neverificate + cu algoritm schimbat). Interfața în engleză, ca restul panoului Teacher. |
| Livrare | Plan → aprobare → baza de date întâi (cu acordul tău la aplicare, EU apoi US) → pagina, verificată în browser. |

## Design: baza de date

Tabelul `kanji_detail_words` **rămâne tabelul pe care îl citește aplicația** (lista finală). Nicio funcție care îl
citește nu se schimbă, deci studiul, introducerea kanji-urilor și progresul nu sunt atinse.

### Tabele noi (identice pe EU și US; toate cu RLS, fără drepturi directe pentru `anon`/`authenticated`)

1. `kanji_detail_words_algo (kanji_id, kanji_word_id, rank)` — rezultatul curent al algoritmului (ceea ce scria
   `rebuild` până acum direct în `kanji_detail_words`). Inițial = copia lui `kanji_detail_words` de la aplicare.
2. `kanji_word_algo_info (kanji_id, kanji_word_id, cand_class, tier, level_gap, group_size, group_selected,
   pick_kind, dup_of)` — pentru **toți** candidații (26122 de rânduri), scrisă de `rebuild` din aceleași CTE-uri.
   Din ea derivă UI-ul textul „ales: campionul grupului 2”, „respins: același cuvânt, altă înregistrare”, „respins:
   grup sub limită”, „respins: kanji-ul folosește doar cuvinte normale” etc.
3. `kanji_word_overrides (kanji_id, kanji_word_id, op check in ('add','remove'), primary key (kanji_id, kanji_word_id))`
   — starea curentă a modificărilor adminului.
4. `kanji_word_review (kanji_id primary key, version int not null default 0, reviewed boolean, reviewed_at, reviewed_by,
   algo_ids_at_review bigint[], updated_at, updated_by)` — versiunea per kanji (blocare optimistă) și marcajul „verificat”.
5. `kanji_word_history` — **append-only**: `id uuid`, `kanji_id`, `version`, `kind` (`save`, `reset`, `restore`,
   `bulk`, `undo_batch`, `restore_all`, `review`, `algo_changed`), `batch_id uuid null`, `overrides jsonb` (setul COMPLET
   după modificare), `final_ids bigint[]`, `algo_ids bigint[]`, `reviewed boolean`, `note`, `admin_id`, `admin_email`,
   `created_at`. `unique (kanji_id, version)`. Fiecare rând stă singur (stare completă, nu diferență), așa că
   restaurarea la orice versiune și „la ora T” sunt simple citiri.
6. `kanji_detail_words_snapshots (id uuid, taken_at, row_count, content_hash, rows jsonb)` — **append-only**; o copie
   a listei finale pe zi, sărită dacă hash-ul e identic cu cel anterior. Cron `pg_cron` zilnic, pe fiecare regiune.

Append-only: `REVOKE UPDATE, DELETE, TRUNCATE` + trigger `BEFORE UPDATE OR DELETE` (și `BEFORE TRUNCATE`) care ridică
excepție, pe tabelele 5 și 6.

### Lista finală și ordinea

Funcția `kanji_word_sort_keys` (view) dă pentru fiecare (kanji, kanji_word): `reading_group`, `tier`, `level_gap`,
`is_common`, `freq_score` — exact cheile din `rebuild`. Lista finală a unui kanji =
`(algo \ remove) ∪ add`, filtrată la `study_enabled`, numerotată cu **aceeași ordine** ca `rebuild`
(`reading_group nulls last, tier, level_gap, is_common desc, freq_score desc, kanji_word_id`). Pentru un kanji neatins,
rangul final e deci identic cu cel de azi.

### Modificarea lui `rebuild_kanji_detail_words()`

Se desparte în două (aceeași migrație, aceleași CTE-uri neschimbate):
1. calculează algoritmul → scrie `kanji_detail_words_algo` și `kanji_word_algo_info`;
2. `apply_kanji_word_overrides()` → reface `kanji_detail_words` din algo + `kanji_word_overrides`, apoi, pentru
   fiecare kanji verificat a cărui listă de algoritm s-a schimbat față de `algo_ids_at_review`, scrie un rând
   `algo_changed` în istoric (`reviewed = false`, `version + 1`).

Override-urile care nu mai au sens după o rulare (cuvânt scos din algoritm care era în `remove`; cuvânt dezactivat
la studiu) sunt ignorate la aplicare și semnalate în UI („fără efect”), nu șterse.

**Test de acceptare al migrației:** cu zero override-uri, `kanji_detail_words` rezultat după migrație trebuie să fie
**identic** cu cel de dinainte (5189 de rânduri, hash egal), pe ambele regiuni.

### Funcții (toate `SECURITY DEFINER`, gardă `public.is_admin()`, `EXECUTE` doar pentru `authenticated`)

- Citire: `admin_get_kanji_words_overview()` (un rând pe kanji: lista finală, lista algoritmului, versiune, verificat,
  steag „algoritm schimbat”, ultima modificare — pentru filtrele din client, ca la `rosterView.ts`);
  `admin_get_kanji_word_candidates(kanji_id)` (toți candidații cu info, motiv, câți elevi au cardul — din
  `admin_all.user_kanji_reading_progress`, deci ambele regiuni); `admin_get_kanji_words_history(kanji_id)`;
  `admin_get_kanji_words_todo_count()` (placa din Overview); `admin_kanji_words_parity()`.
- Scriere: `admin_save_kanji_words(kanji_id, expected_version, add_ids, remove_ids, note)` (starea nouă completă),
  `admin_review_kanji_words(kanji_ids, expected_versions, reviewed)`, `admin_reset_kanji_words(kanji_ids, …)`,
  `admin_restore_kanji_words_version(kanji_id, version, expected_version)`,
  `admin_bulk_kanji_words(kanji_ids, op, params, expected_versions, note, dry_run)`,
  `admin_undo_kanji_words_batch(batch_id, dry_run)`, `admin_restore_kanji_words_to(timestamp, dry_run)`.
  `dry_run` întoarce doar numărul de kanji/cuvinte afectate, pentru previzualizare.

## Design: sincronizarea EU ↔ US

Aceeași schemă pe ambele; fiecare scriere de admin rulează pe regiunea unde e adminul **și** pe cealaltă prin FDW,
în aceeași tranzacție: se înlocuiesc `kanji_word_overrides` și `kanji_word_review` ale kanji-ului, se inserează același
rând de istoric (același `uuid`, deci fără conflict de secvențe) și se rescriu rândurile kanji-ului în
`kanji_detail_words`. Datele de referință fiind identice, lista finală se calculează o dată și se scrie pe ambele.
Dacă scrierea pe cealaltă regiune eșuează, tranzacția întreagă pică și adminul vede eroarea; nu rămâne scriere pe jumătate.

- Pe EU: variantele care scriu prin `mirror_us_fdw`. Pe US: oglinda lor prin `mirror_eu_fdw`, `etichete` inversate
  (aceeași convenție ca fișierele `*_eu` / `*_us` din `MIGRATION_PARITY.md`).
- **Pas manual, ca la FDW-ul actual** (nu se comite): `IMPORT FOREIGN SCHEMA public LIMIT TO (<tabelele noi>) FROM
  SERVER … INTO mirror_us_fdw` pe EU, și simetric pe US. Utilizatorul îl rulează sau îl aprob eu pe rând.
- `admin_kanji_words_parity()` compară hash-ul listei finale, numărul de override-uri și versiunea maximă între
  regiuni; pagina arată un banner dacă diferă (singurul risc rămas: commit-ul local reușește, cel de pe cealaltă
  regiune nu, într-o fereastră foarte îngustă).

## Design: pagina

Fișiere noi (calea exactă la implementare): `app/(shell)/admin/kanji-words/page.tsx` + componente
(`KanjiList`, `FilterPanel` în stilul chip-urilor din `students/FilterPanel.tsx`, `EditorPanel`, `HistoryPanel`,
`BulkBar`, `StudentPreview`), `kanjiWordsView.ts` (filtre/sortare în client, ca `rosterView.ts`) și
`lib/client-data/adminKanjiWords.ts` (hook-uri peste RPC-uri, ca `adminDashboard.ts`). Placă nouă pe
`app/(shell)/admin/page.tsx`, cu `admin_get_kanji_words_todo_count()` (roșie când sunt kanji cu „algoritm schimbat”).
Verificare de acces: `useRequireAdmin()`, ca celelalte pagini.

- **Listă (stânga)**: caracter, nivel, cuvintele finale, insigne („modificat”, „+2”, „fără nivel”, „algoritm schimbat”,
  „verificat”), bară de progres „X din 2229 verificate” pe niveluri. Sortare implicită: nivel N5→N1, apoi frecvența
  kanji-ului; schimbabilă (diferență de nivel, număr de cuvinte, ultima modificare). Selecție multiplă pentru acțiunile în masă.
- **Editor (dreapta; pe telefon, pe tot ecranul)**: candidații cu bife, grupați pe grup de citire; pe fiecare rând:
  furigana, sens, insigna de nivel (+gap, culoare), frecvență/„comun”, motivul algoritmului, câți elevi au cardul, ↺ pentru
  cuvintele modificate; avertisment peste 5 cuvinte; ciornă locală, previzualizare „cum vede elevul” (kanji meaning + N
  carduri „Word reading”, cu diferența față de acum, redate cu `renderTargetWord` din `lib/study/furigana.tsx`),
  notă opțională, buton „Salvează”; refuz cu „s-a schimbat în timp” la conflict.
- **Istoric (în panou)**: versiunile kanji-ului, cine/când/notă, diferența față de versiunea anterioară, „Restaurează”.
- **Acțiuni în masă**: bară care apare când ai selecție sau un filtru activ; fiecare cere întâi `dry_run` și arată
  „N kanji, M cuvinte vor fi schimbate”, apoi confirmă; după, „Anulează lotul” rămâne vizibil. „Restaurare globală la
  dată/oră” într-un meniu separat, tot cu previzualizare.

## Faze de livrare

1. **Baza de date (EU + US).** Trei fișiere în `supabase/migrations/` (nume cu `date -u +%Y%m%d%H%M%S`, LF, prima linie
   cu domeniul): (a) tabele + view + `rebuild` despărțit + `apply_kanji_word_overrides` + citiri + cron zilnic
   — ambele regiuni, text identic; (b) funcțiile de scriere cu FDW — varianta EU; (c) oglinda US. Înainte de aplicare:
   test într-o tranzacție cu `rollback` pe fiecare regiune (hash identic al `kanji_detail_words`, inserare de test,
   append-only respins, conflict de versiune). Aplicare cu acordul tău explicit, EU apoi US, `psql -f`; dacă clasificatorul
   blochează scrierea, îți dau SQL-ul pentru SQL Editor. Apoi rândurile de ledger și rândurile din `MIGRATION_PARITY.md`.
2. **Pagina.** Citiri + listă + filtre + editor + salvare; apoi istoric/restaurare; apoi acțiuni în masă; apoi placa
   din Overview. Verificată în browser (Chrome-ul tău cu admin, per memoria de test) și cu `tsc`/`eslint`.
3. **Închidere.** Rând în `MIGRATION_PARITY.md`, memorie, commit pe `sandbox`.

## Cazuri-limită de acoperit

- Kanji cu 0 cuvinte (265) poate primi cuvinte; kanji cu cuvinte poate ajunge la 0 (fără limită minimă).
- Un cuvânt aflat și în `add`, și în `remove`: imposibil prin constrângerea de cheie primară; serverul normalizează.
- `rebuild` rulat din nou după modificări: override-urile se reaplică, „algoritm schimbat” apare doar la kanji verificate
  a căror listă de algoritm chiar diferă.
- Restaurare la o versiune care conține cuvinte devenite `study_enabled = false`: sunt păstrate în override-uri, ignorate
  în lista finală, semnalate în UI.
- Cuvânt cu același text în două rânduri `vocabulary`/`kanji_word` (deduplicarea din `rebuild`): editorul le arată pe
  amândouă, dar o listă finală nu poate conține același text de două ori (verificat la salvare).
- Admin pe US: aceleași funcții, varianta US; lista finală și istoricul ajung pe EU prin FDW.
- Securitate: scrierile merg doar prin RPC-uri `SECURITY DEFINER` cu `is_admin()`; clienții (`anon`/`authenticated`) nu
  au drepturi directe pe tabelele noi, iar istoricul nu poate fi modificat nici din SQL obișnuit (trigger).

## Abateri față de plan (făcute la implementarea bazei de date)

- **Un singur set de funcții pentru ambele regiuni.** În loc de variante `_eu`/`_us` ale fiecărui RPC, tot codul de scriere
  e text identic pe ambele (partea 2), iar singura diferență regională e `kw_remote_schema()` (`mirror_us_fdw` pe EU,
  `mirror_eu_fdw` pe US) + importul celor 4 tabele străine (părțile 3 și 4). Mai puțin text de ținut în paritate.
- **Primul snapshot zilnic se ia la aplicare**, deci există de la început o copie a listei finale de azi (egală cu cea a
  algoritmului, fiindcă nu există încă modificări). Nu e „baseline-ul înghețat” respins mai sus (nu face parte din
  mecanismul algoritmului), dar e acolo, append-only.
- **`rebuild_kanji_detail_words()` nu mai e executabilă de `anon`/`authenticated`** (era, iar acele roluri au TRUNCATE pe
  `kanji_detail_words`). Nimic din aplicație nu o apelează.
- **Operațiile în masă și previzualizările** rulează aceleași commit-uri reale, într-o sub-tranzacție anulată pentru
  `dry_run`, deci previzualizarea nu poate diferi de execuție. Cost: ~4,7 s pentru 2229 de kanji pe EU.
- Marcajul „algoritm schimbat” (`ac`) = `algo_ids_at_review` nenul și diferit de lista curentă a algoritmului; `rebuild`
  scoate „verificat” numai kanji-urilor verificate a căror listă a algoritmului s-a schimbat (rând `algo_changed` în istoric).

## Fișiere de migrare (în `supabase/migrations/`)

| Fișier | Regiuni | Conține |
|---|---|---|
| `20261007064115_kanji_words_admin_tables.sql` | EU + US | view `kanji_word_sort_keys`, 6 tabele, jurnal/snapshot append-only, `apply_kanji_word_overrides`, `rebuild` despărțit, autotest de identitate (5189 rânduri, hash `94f91efe…`), primul snapshot, cron `kanji-words-snapshot` |
| `20261007064452_kanji_words_admin_rpcs.sql` | EU + US | `kw_commit`/`kw_apply_items`/`kw_push`/`kw_restore_item`/`kw_stats` + cele 11 RPC-uri admin |
| `20261007064713_kanji_words_admin_remote_eu.sql` | doar EU | `kw_remote_schema()` → `mirror_us_fdw`, import foreign tables (după ce US are partea 1+2) |
| `20261007064714_kanji_words_admin_remote_us.sql` | doar US | oglinda, `mirror_eu_fdw` (după ce EU are partea 1+2) |

Ordinea de aplicare: 1 → 2 pe EU și pe US (oricare primul), apoi 3 pe EU și 4 pe US. Fiecare cu rândul de ledger.

## Starea fazelor

- **Faza 1 (baza de date): GATA, aplicată pe EU și US la 2026-10-07, ledger completat pe ambele.** Înainte de aplicare,
  teste pe EU și pe US într-o tranzacție anulată (push-ul înlocuit cu un stub): lista rebuilt = identică cu cea de azi
  (hash egal pe ambele regiuni), salvare/conflict/no-op/cuvânt străin/cuvânt duplicat, restaurare la versiune, operație
  în masă (519 kanji / 691 cuvinte, exact cifrele măsurate), anulare de lot cu un kanji editat între timp (sărit),
  restaurare globală, „verificat” și „algoritm schimbat”, permisiuni (`anon`/`authenticated`), refuz pentru non-admin
  (pe EU). După aplicare, push-ul prin FDW testat în ambele sensuri (EU→US și US→EU), tot într-o tranzacție anulată:
  salvare (~1,7 s), lot de 519 kanji (~8 s), anulare de lot (~5 s), paritate exactă după fiecare pas, conflict cu o
  versiune mai nouă de pe cealaltă regiune (refuzat, nimic rămas scris local). Starea live după teste: 0 rânduri de
  istoric/override pe ambele, `kanji_detail_words` neschimbat (hash `94f91efe…`).
  Costuri măsurate pe EU: overview 0,4 s / ~600 KB JSON (necomprimat), previzualizare în masă pe toate cele 2229 de
  kanji 4,7 s.
- **Faza 2 (pagina `/admin/kanji-words`): construită, verificată în Chrome-ul adminului pe date live, doar cu citiri**
  (2026-10-07). Fișiere: `app/(shell)/admin/kanji-words/` (`page.tsx`, `kanjiWordsView.ts` filtre/sortare/URL,
  `FilterPanel`, `KanjiList`, `EditorPanel`, `CandidateRow`, `StudentPreview`, `HistoryPanel`, `BulkMenu`,
  `OperationModal`, `BatchesModal`, `wordLabels.ts`), `lib/data/adminKanjiWords.ts` (RPC-uri + erori),
  `lib/client-data/adminKanjiWords.ts` (hook-uri), `lib/types/kanjiWords.ts`, intrare „Kanji words” în meniul Teacher,
  placă pe `/admin` cu numărul de kanji de verificat. Verificat live: lista (2229 de kanji), filtrul „2+ niveluri peste
  kanji” pe N5–N2 = **519** (exact numărul măsurat în DB), editorul (candidați cu nivel/diferență/frecvență/grup/
  elevi cu card/motivul algoritmului, previzualizarea „What a student gets”), tabul History, ferestrele „Bulk changes” și
  previzualizarea în masă („519 kanji will change, 691 words removed”), placa din Overview, layout de telefon (iframe de
  390 px), `tsc` și `eslint` fără erori. După aceste verificări, ambele baze au rămas curate (0 rânduri de istoric).
  **Netestat în interfață (scrie pe live, iar istoricul e permanent):** salvarea unui kanji, restaurarea unei versiuni,
  executarea unei acțiuni în masă, anularea unui lot, conflictul de versiune. Logica lor e acoperită de testele SQL din
  faza 1 (inclusiv push-ul în ambele sensuri); lipsește doar parcursul prin pagină.
- Faza 3 (închidere): neînceput.
