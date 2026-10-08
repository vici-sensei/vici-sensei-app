export type KanaScript = "hiragana" | "katakana";

/** Hiragana and katakana are twin tables, each with a twin per-user progress table. Their names live
 * here so a query written once for both picks them from this map (each name stays a literal, which
 * keeps it greppable and typed). */
export const KANA_TABLES = {
  hiragana: { table: "hiragana", progressTable: "user_hiragana_progress", idColumn: "hiragana_id" },
  katakana: { table: "katakana", progressTable: "user_katakana_progress", idColumn: "katakana_id" },
} as const satisfies Record<KanaScript, { table: string; progressTable: string; idColumn: string }>;
