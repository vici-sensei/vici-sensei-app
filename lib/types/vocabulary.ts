export interface VocabularyRow {
  id: number;
  word: string;
  kana_reading: string | null;
  primary_meanings: string[] | null;
  /** JMdict senses not already covered by primary_meanings -- one array of glosses per sense (see
   * 20261130_vocabulary_primary_other_meanings.sql). Most words have none. */
  other_meanings: string[][] | null;
  parts_of_speech: string[] | null;
  ids_kanji: number[] | null;
  jlpt_level: string | null;
  is_common_jisho: boolean | null;
  usually_kana: boolean | null;
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
  primary_meanings: string[] | null;
  other_meanings: string[][] | null;
  parts_of_speech: string[] | null;
  jlpt_level: string | null;
  other_readings: string[] | null;
  furiganas: string[] | null;
  /** Optional: a detail row cached before this field existed simply lacks it (counts as false). */
  usually_kana?: boolean | null;
}
