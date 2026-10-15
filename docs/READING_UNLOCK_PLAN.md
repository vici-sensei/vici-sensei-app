# Cuvinte blocate pe cartonașul „New kanji” și cartonașe „Reading unlock”

Cerut pe 2026-10-15. Migrațiile: `supabase/migrations/20261015183526_kanji_reading_unlocks.sql` și reparația
`20261015185947_reading_unlocks_respect_enabled_levels.sql` (ambele aplicate pe EU și US în aceeași zi, ledger completat;
vezi `supabase/MIGRATION_PARITY.md`).

Testat în aplicație pe 2026-10-15 cu contul vici.sensei (US): lacăte pe New kanji (先日 → „Unlocks at N4”, 日本人 →
„Unlocks at N1”) și în dicționar, setarea salvează, iar la N4+N5 cartonașul Reading unlock pentru 日 vine după
recapitulările lui și e urmat de Word reading-ul lui 先日; doar N4 activ → nicio deblocare, fără eroare.

## Ce face

- Pe cartonașul **New kanji**, cuvintele mult peste nivelul kanji-ului apar **gri, cu lacăt** și un rând mic
  „Unlocks at N4” sub sens; sunt mutate la finalul listei, sensul rămâne vizibil, kanji-urile rămân apăsabile.
- Pentru ele **nu se creează** cartonaș „Word reading” când se introduce kanji-ul. Stau în
  `user_kanji_reading_pending`.
- Când nivelul elevului ajunge suficient de aproape, apare un cartonaș **Reading unlock** (unul pe kanji: kanji-ul,
  sensul și cuvintele deblocate), iar după Next vin cartonașele „Word reading” ale acelor cuvinte.
- Aceeași marcare (gri + lacăt + „Unlocks at N4”, la final) și pe pagina kanji-ului din dicționar
  (`/browse/kanji/detail`, secțiunea Example words).
- Popup-ul de trecere la nivelul următor spune câte cuvinte s-au deblocat („35 word readings unlocked — they'll
  arrive 10 a day”).

## Regula (deciziile utilizatorului)

Ranguri: N5 = 1 … N1 = 5; **un cuvânt fără nivel JLPT = 6 („peste N1”)**, aceeași convenție ca filtrul din
`/admin/kanji-words`.

| | Regula | Funcția |
|---|---|---|
| Blocabil | rang cuvânt − rang kanji **≥ 2** (la un kanji N5: cuvintele N3, N2, N1 și cele fără nivel) | `kanji_word_unlock_rank` |
| Se deblochează | când nivelul elevului (cel mai înalt nivel activ) ajunge la **rang cuvânt − 1** (N3 → la N4, N1 → la N2, fără nivel → la N1) | idem |
| Blocat pentru un elev | blocabil **și** nivelul lui e încă sub nivelul de deblocare (un elev N4 care învață un kanji N5 primește direct cuvântul N3) | `kanji_word_is_locked` |

Un cuvânt se deblochează și contează la progres **doar cât timp nivelul kanji-ului e activat** (`enabled_levels`),
la fel ca recapitulările: un elev care alege N4 fără „Also study lower levels” nu vede recapitulările kanji-urilor N5,
deci nici deblocări pentru ele (`20261015185947_reading_unlocks_respect_enabled_levels.sql`). După o trecere automată
de nivel, nivelurile de dedesubt rămân activate, deci cazul obișnuit nu e afectat.

Cifre pe 2026-10-15 (5189 de cuvinte în listele kanji-urilor): 691 blocabile. Un elev care parcurge totul
deblochează ~35 la N4, ~57 la N3, ~182 la N2 și ~417 la N1.

## Alte decizii

| Subiect | Decizie |
|---|---|
| Ritm | Setare nouă **„Unlocked word readings per day”** (`new_reading_unlocks_per_day`, 1-50, implicit 10), separată de limita de cuvinte noi. Un kanji se ia întreg, deci ultimul kanji al zilei poate depăși cu câteva cuvinte. |
| Câte cartonașe | **Unul pe kanji**, cu toate cuvintele lui deblocate azi. |
| Unde în sesiune | După recapitulări, înaintea materialului nou (kanji/cuvinte noi). |
| Progresul pe nivel | Un cuvânt blocabil **contează la nivelul la care se deblochează** (cuvintele N3 ale kanji-urilor N5 intră la N4), doar pentru kanji introduse de elev — deci nu treci de N4 până nu le înveți. Un elev care a început direct de la N4 nu e ținut pe loc de kanji N5 pe care nu le-a văzut. |
| Cartonașe existente | Cele 22 de cartonașe deja create (4 elevi pe EU: Cezara 15, Alexandra Birdan 3, matei 2, Vici 2) **au fost șterse și puse în așteptare**. Copie: `Documents\vici-backups\reading_lock_backup_eu_20261015.csv`. |
| Anunț | Un rând în popup-ul de level-up. |

## Cazuri tratate

- **Versiunea veche a aplicației (până la deploy):** nicio funcție nu și-a schimbat argumentele sau coloanele.
  Pe cartonașul New kanji cuvintele blocate apar încă normal (fără cartonaș de citire după ele), iar cartonașele
  Reading unlock apar abia după deploy. Nicio eroare.
- **Un cartonaș șters în timp ce era deschis într-o sesiune:** `submit_review` dă SR404, pe care aplicația îl
  ignoră deja (cartonaș învechit).
- **Kanji resetat** (Reset progress pe cartonașul de sens): i se șterg și cuvintele în așteptare; un kanji
  resetat nu deblochează nimic până nu e reintrodus, iar `introduce_kanji` curăță oricum rămășițele.
- **Kanji suspendat:** nu deblochează nimic cât timp e suspendat.
- **Alt tab / limita atinsă:** `unlock_kanji_readings` întoarce și cuvintele deblocate azi din alt tab; când nu
  mai e nimic de făcut dă P0002 și cartonașul dispare fără eroare.
- **Admin schimbă nivelul unui cuvânt sau îl scoate din listă:** regula se calculează cu nivelul curent; un cuvânt
  aflat deja în așteptare tot se deblochează (promisiunea făcută pe cartonaș), iar un cuvânt cu
  `study_enabled = false` nu mai vine și nu mai contează la progres.
- **Coborârea manuală a nivelului:** ce s-a deblocat rămâne; ce e încă în așteptare așteaptă din nou.
- **Mutarea contului între regiuni:** `user_kanji_reading_pending` e copiat de Worker (`worker/lib/regionMove.ts`).
- **Ștergerea contului:** `on delete cascade`.
- **Oglinzile de admin:** nu au primit coloana nouă, intenționat (vezi nota din `MIGRATION_PARITY.md`).

## Ce mai e de făcut

- Merge pe `main` + deploy (aplicația și Worker-ul), ca userii să vadă lacătele și cartonașele Reading unlock.
