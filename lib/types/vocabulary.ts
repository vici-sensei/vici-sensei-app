export interface VocabularyRow {
  id: number;
  word: string;
  kana_reading: string | null;
  meanings: string[] | null;
  parts_of_speech: string[] | null;
  ids_kanji: number[] | null;
  jlpt_level: string | null;
  is_common_jisho: boolean | null;
  usually_kana: boolean | null;
  frequency: string | null;
  romaji_reading: string | null;
  furiganas: string[] | null;
  romaji_furiganas: string[] | null;
  other_readings: string[] | null;
}

export interface VocabularyListResponse {
  data: VocabularyRow[];
  count: number;
  limit: number;
  offset: number;
}

export interface VocabularyDetailRow {
  id: number;
  word: string;
  kana_reading: string | null;
  meanings: string[] | null;
  parts_of_speech: string[] | null;
  jlpt_level: string | null;
  other_readings: string[] | null;
  furiganas: string[] | null;
}
