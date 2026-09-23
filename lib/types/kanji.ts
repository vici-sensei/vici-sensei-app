export interface KanjiRow {
  id: number;
  kanji: string;
  meanings: string[] | null;
  level: string | null;
  kun_readings: string[] | null;
  on_readings: string[] | null;
}

/** One kanji from a "New kanji" card's word list -- see fetchKanjiInfoByCharacters. */
export interface KanjiInfo extends Pick<KanjiRow, "kanji" | "meanings" | "level"> {
  /** This user's kanji_meaning card is review/relearning -- get_level_progress's "Already learned". */
  meaning_learned: boolean;
}

export interface KanjiListResponse {
  data: KanjiRow[];
  count: number;
  limit: number;
  offset: number;
}

export interface KanjiDetailWord {
  id: number;
  reading_group: number | null;
  vocabulary: {
    word: string;
    kana_reading: string | null;
    primary_meanings: string[] | null;
    other_meanings: string[][] | null;
    furiganas: string[] | null;
    jlpt_level: string | null;
    /** get_kanji_detail_words (20261233_usually_kana_on_kanji_word_rpcs.sql) -- absent from an older DB. */
    usually_kana?: boolean | null;
  };
}

export interface KanjiDetail extends KanjiRow {
  words: KanjiDetailWord[];
}
