// Links public.vocabulary rows to public.jmdict_entries rows for the ambiguous group (multiple
// word+kana_reading candidates -- real Japanese homographs/homophones, e.g. "collar" vs "color"
// for the same katakana spelling and reading). Reads three JSON dumps produced beforehand via
// `npx supabase db query --linked ... --output-format json` (see the command sequence this
// script was written alongside): ambiguous-groups.json (vocab row + every candidate sharing its
// word/kana_reading), zero-match.json (vocabulary rows with no such candidate at all), and
// zero-match-hints.json (up to 8 "nearby" jmdict_entries per zero-match row, matched loosely by
// word OR kana_reading alone, for manual review context).
//
// For each ambiguous group, scores every candidate by comparing vocabulary.meanings (a partial,
// sometimes-abbreviated list per the user) against the candidate's meanings: an exact
// (normalized) string match is weighted far above a loose shared-word match, since vocabulary's
// meanings -- though incomplete -- are still verbatim-ish snippets of the real sense, not
// paraphrases. A candidate is auto-picked only when its score strictly beats the runner-up and is
// > 0; otherwise the group is left for manual review.
//
// Usage: node scripts/link-vocabulary-jmdict.mjs <dump-dir> <output-dir>
// Reads <dump-dir>/{ambiguous-groups,zero-match,zero-match-hints}.json (each the raw
// `{boundary, rows, warning}` wrapper from `supabase db query --output-format json`).
// Writes <output-dir>/auto-resolved-batch.sql (apply directly) and <output-dir>/review-items.json
// (feed into the Phase D review Artifact).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

function loadRows(filePath) {
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  return Array.isArray(parsed) ? parsed : parsed.rows;
}

function normalizeMeaning(text) {
  return text
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/["'.,;]/g, "")
    .replace(/^to\s+/, "")
    .trim();
}

function scoreCandidate(vocabMeanings, candidateMeanings) {
  const vocabNorm = (vocabMeanings ?? []).map(normalizeMeaning).filter(Boolean);
  const candNorm = new Set((candidateMeanings ?? []).map(normalizeMeaning).filter(Boolean));
  let exactHits = 0;
  for (const m of vocabNorm) if (candNorm.has(m)) exactHits++;

  const vocabWords = new Set(vocabNorm.flatMap((m) => m.split(/\s+/)).filter((w) => w.length > 2));
  const candWords = new Set([...candNorm].flatMap((m) => m.split(/\s+/)).filter((w) => w.length > 2));
  let wordHits = 0;
  for (const w of vocabWords) if (candWords.has(w)) wordHits++;

  return exactHits * 10 + wordHits;
}

function main() {
  const [, , dumpDir, outDir] = process.argv;
  if (!dumpDir || !outDir) {
    console.error("Usage: node scripts/link-vocabulary-jmdict.mjs <dump-dir> <output-dir>");
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });

  const ambiguousRows = loadRows(path.join(dumpDir, "ambiguous-groups.json"));
  const zeroMatchRows = loadRows(path.join(dumpDir, "zero-match.json"));
  const hintRows = loadRows(path.join(dumpDir, "zero-match-hints.json"));

  const groups = new Map();
  for (const r of ambiguousRows) {
    if (!groups.has(r.vocab_id)) {
      groups.set(r.vocab_id, {
        vocab_id: r.vocab_id,
        vocab_word: r.vocab_word,
        vocab_kana: r.vocab_kana,
        vocab_meanings: r.vocab_meanings,
        candidates: [],
      });
    }
    groups.get(r.vocab_id).candidates.push({
      jrow_id: r.jrow_id,
      jmdict_id: r.jmdict_id,
      word: r.j_word,
      kana_reading: r.j_kana,
      meanings: r.j_meanings,
      parts_of_speech: r.j_pos,
    });
  }

  const autoResolved = [];
  const needsReview = [];
  for (const group of groups.values()) {
    const scored = group.candidates
      .map((c) => ({ ...c, score: scoreCandidate(group.vocab_meanings, c.meanings) }))
      .sort((a, b) => b.score - a.score);
    const [best, runnerUp] = scored;
    if (best.score > 0 && (!runnerUp || best.score > runnerUp.score)) {
      autoResolved.push({ vocab_id: group.vocab_id, jrow_id: best.jrow_id, score: best.score });
    } else {
      needsReview.push({
        kind: "ambiguous",
        vocab_id: group.vocab_id,
        vocab_word: group.vocab_word,
        vocab_kana: group.vocab_kana,
        vocab_meanings: group.vocab_meanings,
        candidates: scored,
      });
    }
  }

  const hintsByVocabId = new Map();
  for (const h of hintRows) {
    if (!hintsByVocabId.has(h.vocab_id)) hintsByVocabId.set(h.vocab_id, []);
    hintsByVocabId.get(h.vocab_id).push({
      jrow_id: h.jrow_id,
      jmdict_id: h.jmdict_id,
      word: h.j_word,
      kana_reading: h.j_kana,
      meanings: h.j_meanings,
    });
  }
  for (const z of zeroMatchRows) {
    needsReview.push({
      kind: "zero_match",
      vocab_id: z.vocab_id,
      vocab_word: z.vocab_word,
      vocab_kana: z.vocab_kana,
      vocab_meanings: z.vocab_meanings,
      candidates: hintsByVocabId.get(z.vocab_id) ?? [],
    });
  }

  const updateTuples = autoResolved.map((r) => `(${r.vocab_id}, ${r.jrow_id})`);
  const sql =
    updateTuples.length === 0
      ? "-- no auto-resolved rows\n"
      : `update public.jmdict_entries as t\nset vocabulary_id = v.vocab_id, match_method = 'ambiguous_resolved_by_meaning'\nfrom (values\n  ${updateTuples.join(",\n  ")}\n) as v(vocab_id, jrow_id)\nwhere t.id = v.jrow_id;\n`;
  writeFileSync(path.join(outDir, "auto-resolved-batch.sql"), sql, "utf8");
  writeFileSync(path.join(outDir, "review-items.json"), JSON.stringify(needsReview, null, 2), "utf8");

  console.log(`Ambiguous groups: ${groups.size}`);
  console.log(`Auto-resolved (clear meaning-overlap winner): ${autoResolved.length}`);
  console.log(`Needs manual review: ambiguous=${needsReview.filter((r) => r.kind === "ambiguous").length}, zero_match=${needsReview.filter((r) => r.kind === "zero_match").length}, total=${needsReview.length}`);
}

main();
