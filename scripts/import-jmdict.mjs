// One-off (but re-runnable for future JMdict version bumps) importer: reads a JMdict-simplified
// JSON export, expands short tag codes to long-form English via the file's own top-level `tags`
// map, flattens each entry's senses into public.vocabulary-shaped arrays (meanings,
// parts_of_speech, ...), and writes batched `INSERT ... ON CONFLICT (jmdict_id) DO NOTHING` SQL
// files that get applied to the live Supabase project with `npx supabase db query --linked -f
// <file>`.
//
// The source file is one compact JSON object per line for every entry in `words[]` (confirmed by
// direct inspection of jmdict-eng-3.6.2.json) -- so this reads it line-by-line via a readline
// stream instead of JSON.parse-ing the whole ~118MB file, keeping memory flat (tag map + kanji
// lookup + one batch buffer) regardless of file size. Every entry line ends in `,` except the
// very last one, which ends in the `words` array's closing `]` instead -- parseWordLine strips
// whichever trailing character is present.
//
// Usage:
//   node scripts/import-jmdict.mjs <path-to-jmdict.json> <output-dir> [--limit=N] [--kanji-lookup=path]
//
// --limit=N stops after N word entries -- use this for a smoke-test batch before the full run.
// --kanji-lookup defaults to scripts/import-jmdict-kanji-lookup.json (dump of `select id, kanji
// from public.kanji`, produced via the Supabase CLI before running this script).
// Writes <output-dir>/batch_0001.sql .. batch_NNNN.sql plus manifest.json.

import { createReadStream, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_ROWS_PER_BATCH = 1000;
const MAX_BYTES_PER_BATCH = 5 * 1024 * 1024; // safety net -- row cap binds first at this file's ~540B/entry raw average

function sqlQuoteText(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

// Postgres array-literal internal escaping (backslash, double-quote) happens first; the outer
// single-quote doubling for the SQL string literal happens second, over the whole {..} text --
// standard two-stage decode (SQL string literal, then array-literal parser) on the Postgres side.
function pgTextArrayLiteral(values) {
  if (!values || values.length === 0) return "{}";
  const parts = values.map((v) => `"${String(v).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`);
  return `{${parts.join(",")}}`;
}

function sqlQuoteTextArray(values) {
  return `'${pgTextArrayLiteral(values).replaceAll("'", "''")}'`;
}

function sqlQuoteBigintArray(values) {
  if (!values || values.length === 0) return "'{}'";
  return `'{${values.join(",")}}'`;
}

// standard_conforming_strings is on in this project, so JSON.stringify's own \" \\ \n escaping
// must reach the jsonb parser untouched -- only the outer SQL string literal's single quotes
// get doubled, same rule as sqlQuoteTextArray above.
function sqlQuoteJsonb(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function expandTag(code, tagMap, unknownCodesSeen) {
  const expanded = tagMap.get(code);
  if (expanded === undefined) {
    unknownCodesSeen.add(code);
    return code; // fall back to the short code rather than failing the whole import
  }
  return expanded;
}

function parseTagsLine(line) {
  const match = line.match(/^"tags":\s*(\{.*\}),?\s*$/);
  return match ? JSON.parse(match[1]) : null;
}

function parseWordLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{"id":"')) return null;
  let jsonPart = trimmed;
  if (jsonPart.endsWith(",") || jsonPart.endsWith("]")) {
    jsonPart = jsonPart.slice(0, -1);
  }
  return JSON.parse(jsonPart);
}

function loadKanjiCharMap(lookupPath) {
  const parsed = JSON.parse(readFileSync(lookupPath, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.rows;
  const map = new Map();
  for (const row of rows) map.set(row.kanji, row.id);
  return map;
}

// Preserves per-sense grouping (companion to the flattened meanings/parts_of_speech/... arrays
// on the row, which merge every sense together and lose which gloss/POS/field belongs to which
// sense). related/antonym/languageSource/gloss.type are copied verbatim -- not tag codes.
function buildSenses(rawSenses, tagMap, unknownCodesSeen) {
  return (rawSenses ?? []).map((s) => ({
    partOfSpeech: (s.partOfSpeech ?? []).map((c) => expandTag(c, tagMap, unknownCodesSeen)),
    field: (s.field ?? []).map((c) => expandTag(c, tagMap, unknownCodesSeen)),
    dialect: (s.dialect ?? []).map((c) => expandTag(c, tagMap, unknownCodesSeen)),
    misc: (s.misc ?? []).map((c) => expandTag(c, tagMap, unknownCodesSeen)),
    info: s.info ?? [],
    related: s.related ?? [],
    antonym: s.antonym ?? [],
    languageSource: s.languageSource ?? [],
    gloss: s.gloss ?? [],
  }));
}

function transformEntry(raw, tagMap, kanjiCharMap, unknownCodesSeen) {
  const kanjiRaw = raw.kanji ?? [];
  const kanaRaw = raw.kana ?? [];

  const primaryKanjiItem = kanjiRaw.find((k) => k.common) ?? kanjiRaw[0] ?? null;
  const primaryKanaItem = kanaRaw.find((k) => k.common) ?? kanaRaw[0] ?? null;

  const word = primaryKanjiItem ? primaryKanjiItem.text : null;
  const kanaReading = primaryKanaItem ? primaryKanaItem.text : null;
  const otherReadings = kanaRaw.filter((k) => k !== primaryKanaItem).map((k) => k.text);
  const isCommonJisho = kanjiRaw.some((k) => k.common) || kanaRaw.some((k) => k.common);

  const meanings = new Set();
  const partsOfSpeech = new Set();
  const fields = new Set();
  const dialects = new Set();
  const miscNotes = new Set();
  const infoNotes = new Set();
  const relatedWords = new Set();
  const antonyms = new Set();
  let usuallyKana = false;

  for (const sense of raw.sense ?? []) {
    for (const g of sense.gloss ?? []) {
      if (g.text) meanings.add(g.text);
    }
    for (const code of sense.partOfSpeech ?? []) partsOfSpeech.add(expandTag(code, tagMap, unknownCodesSeen));
    for (const code of sense.field ?? []) fields.add(expandTag(code, tagMap, unknownCodesSeen));
    for (const code of sense.dialect ?? []) dialects.add(expandTag(code, tagMap, unknownCodesSeen));
    for (const code of sense.misc ?? []) {
      if (code === "uk") usuallyKana = true;
      miscNotes.add(expandTag(code, tagMap, unknownCodesSeen));
    }
    for (const note of sense.info ?? []) infoNotes.add(note);
    for (const rel of sense.related ?? []) {
      if (rel[0]) relatedWords.add(rel[0]);
    }
    for (const ant of sense.antonym ?? []) {
      if (ant[0]) antonyms.add(ant[0]);
    }
  }

  const idsKanji = [];
  if (word) {
    for (const ch of new Set([...word])) {
      const id = kanjiCharMap.get(ch);
      if (id !== undefined) idsKanji.push(id);
    }
  }

  return {
    jmdict_id: raw.id,
    word,
    kana_reading: kanaReading,
    meanings: [...meanings],
    parts_of_speech: [...partsOfSpeech],
    ids_kanji: idsKanji,
    other_readings: otherReadings,
    is_common_jisho: isCommonJisho,
    usually_kana: usuallyKana,
    fields: [...fields],
    dialects: [...dialects],
    misc_notes: [...miscNotes],
    info_notes: [...infoNotes],
    related_words: [...relatedWords],
    antonyms: [...antonyms],
    senses: buildSenses(raw.sense, tagMap, unknownCodesSeen),
  };
}

function rowToInsertTuple(row, sourceVersion, sourceDate) {
  const values = [
    sqlQuoteText(row.jmdict_id),
    sqlQuoteText(row.word),
    sqlQuoteText(row.kana_reading),
    sqlQuoteTextArray(row.meanings),
    sqlQuoteTextArray(row.parts_of_speech),
    sqlQuoteBigintArray(row.ids_kanji),
    sqlQuoteTextArray(row.other_readings),
    row.is_common_jisho ? "true" : "false",
    row.usually_kana ? "true" : "false",
    sqlQuoteTextArray(row.fields),
    sqlQuoteTextArray(row.dialects),
    sqlQuoteTextArray(row.misc_notes),
    sqlQuoteTextArray(row.info_notes),
    sqlQuoteTextArray(row.related_words),
    sqlQuoteTextArray(row.antonyms),
    sqlQuoteJsonb(row.senses),
    sqlQuoteText(sourceVersion),
    sqlQuoteText(sourceDate),
  ];
  return `(${values.join(", ")})`;
}

function rowToSensesUpdateTuple(row) {
  return `(${sqlQuoteText(row.jmdict_id)}, ${sqlQuoteJsonb(row.senses)})`;
}

const INSERT_COLUMNS =
  "(jmdict_id, word, kana_reading, meanings, parts_of_speech, ids_kanji, other_readings, is_common_jisho, usually_kana, fields, dialects, misc_notes, info_notes, related_words, antonyms, senses, source_version, source_date)";

function buildInsertSql(tuples) {
  return `insert into public.jmdict_entries\n  ${INSERT_COLUMNS}\nvalues\n  ${tuples.join(",\n  ")}\non conflict (jmdict_id) do nothing;\n`;
}

// Backfills the senses column for rows a prior --mode=insert run already inserted (that run's
// INSERT ... ON CONFLICT DO NOTHING never touches existing rows, so this update pass is how
// senses gets populated for data imported before this column existed).
function buildSensesUpdateSql(tuples) {
  return `update public.jmdict_entries as t\nset senses = v.senses\nfrom (values\n  ${tuples.join(",\n  ")}\n) as v(jmdict_id, senses)\nwhere t.jmdict_id = v.jmdict_id;\n`;
}

class BatchWriter {
  constructor(outDir, buildSql) {
    this.outDir = outDir;
    this.buildSql = buildSql;
    this.batchIndex = 0;
    this.tuples = [];
    this.byteSize = 0;
    this.totalRows = 0;
    this.manifest = [];
  }
  add(tuple) {
    this.tuples.push(tuple);
    this.byteSize += Buffer.byteLength(tuple, "utf8");
    this.totalRows++;
    if (this.tuples.length >= MAX_ROWS_PER_BATCH || this.byteSize >= MAX_BYTES_PER_BATCH) this.flush();
  }
  flush() {
    if (this.tuples.length === 0) return;
    this.batchIndex++;
    const fileName = `batch_${String(this.batchIndex).padStart(4, "0")}.sql`;
    writeFileSync(path.join(this.outDir, fileName), this.buildSql(this.tuples), "utf8");
    this.manifest.push({ file: fileName, rows: this.tuples.length });
    this.tuples = [];
    this.byteSize = 0;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const [sourcePath, outDir] = positional;
  if (!sourcePath || !outDir) {
    console.error("Usage: node scripts/import-jmdict.mjs <path-to-jmdict.json> <output-dir> [--limit=N] [--kanji-lookup=path] [--mode=insert|update-senses]");
    process.exit(1);
  }
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;
  const kanjiLookupArg = args.find((a) => a.startsWith("--kanji-lookup="));
  const kanjiLookupPath = kanjiLookupArg
    ? kanjiLookupArg.slice("--kanji-lookup=".length)
    : path.join(__dirname, "import-jmdict-kanji-lookup.json");
  const modeArg = args.find((a) => a.startsWith("--mode="));
  const mode = modeArg ? modeArg.slice("--mode=".length) : "insert";
  if (mode !== "insert" && mode !== "update-senses") {
    console.error(`Unknown --mode=${mode} -- expected "insert" (default) or "update-senses".`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  const kanjiCharMap = loadKanjiCharMap(kanjiLookupPath);
  console.log(`Loaded ${kanjiCharMap.size} kanji characters from ${kanjiLookupPath}`);
  console.log(`Mode: ${mode}`);

  let tagMap = null;
  let sourceVersion = null;
  let sourceDate = null;
  let inWords = false;
  let wordsSeen = 0;
  let lineNo = 0;
  const unknownCodesSeen = new Set();
  const writer = new BatchWriter(outDir, mode === "insert" ? buildInsertSql : buildSensesUpdateSql);

  const rl = createInterface({ input: createReadStream(sourcePath, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    lineNo++;
    if (!inWords) {
      const versionMatch = line.match(/^"version":\s*"([^"]+)",?\s*$/);
      if (versionMatch) sourceVersion = versionMatch[1];
      const dateMatch = line.match(/^"dictDate":\s*"([^"]+)",?\s*$/);
      if (dateMatch) sourceDate = dateMatch[1];
      const tags = parseTagsLine(line);
      if (tags) {
        tagMap = new Map(Object.entries(tags));
        console.log(`Parsed ${tagMap.size} tag codes from line ${lineNo}`);
      }
      if (line.trim() === '"words": [') {
        if (!tagMap) throw new Error(`Reached "words" array at line ${lineNo} without a parsed "tags" map -- source file layout changed, aborting.`);
        inWords = true;
      }
      continue;
    }
    const raw = parseWordLine(line);
    if (!raw) continue;
    const row = transformEntry(raw, tagMap, kanjiCharMap, unknownCodesSeen);
    writer.add(mode === "insert" ? rowToInsertTuple(row, sourceVersion, sourceDate) : rowToSensesUpdateTuple(row));
    wordsSeen++;
    if (wordsSeen % 20000 === 0) console.log(`...${wordsSeen} entries processed`);
    if (wordsSeen >= limit) break;
  }
  writer.flush();

  writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify({ totalRows: writer.totalRows, batches: writer.manifest, sourceVersion, sourceDate, unknownCodes: [...unknownCodesSeen] }, null, 2),
  );
  console.log(`Done. ${writer.totalRows} rows across ${writer.manifest.length} batch files in ${outDir}.`);
  if (unknownCodesSeen.size > 0) {
    console.warn(`WARNING: unknown tag codes kept as short codes: ${[...unknownCodesSeen].join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
