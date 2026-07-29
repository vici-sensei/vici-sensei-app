import type { VocabularyRow } from "./vocabulary";

export interface KanjiRow {
  id: number;
  kanji: string;
  meanings: string[] | null;
  level: string | null;
  kun_readings: string[] | null;
  on_readings: string[] | null;
}

export interface KanjiListResponse {
  data: KanjiRow[];
  count: number;
  limit: number;
  offset: number;
}

export interface KanjiDetailWord {
  id: number;
  reading_number: number | null;
  vocabulary: VocabularyRow;
}

export interface KanjiDetail extends KanjiRow {
  words: KanjiDetailWord[];
}
