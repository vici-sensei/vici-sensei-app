import type { ExerciseType, JlptLevel, ProgressStatus } from "@/lib/srs/constants";
import type { StudyTrack } from "./settings";

export interface NewKanjiIntroWord {
  id: number;
  vocabulary: {
    word: string;
    meanings: string[] | null;
    jlpt_level: string | null;
    usually_kana: boolean | null;
    furiganas: string[] | null;
  };
}

export interface RatingPreviews {
  again: string;
  hard: string;
  good: string;
  easy: string;
}

/** Row shape of get_today_activity_counts() -- server-computed "today" counts (see 20260820_today_activity_counts_rpc.sql). */
export interface TodayActivityCounts {
  due_today: number;
  due_learning: number;
  reviewed_today: number;
  new_kanji_today: number;
  new_vocab_today: number;
  new_hiragana_today: number;
  new_katakana_today: number;
}

export interface DueCard {
  exercise_type: ExerciseType;
  progress_id: number;
  kanji_id: number | null;
  word_id: number | null;
  kanji_word_id: number | null;
  hiragana_id: number | null;
  katakana_id: number | null;
  kanji_char: string | null;
  kanji_meanings: string[] | null;
  word: string | null;
  kana_reading: string | null;
  romaji_reading: string | null;
  other_readings: string[] | null;
  furiganas: string[] | null;
  word_meanings: string[] | null;
  /** Meanings from every vocabulary row sharing this word -- the student can't tell which row a card was built from. */
  all_word_meanings: string[] | null;
  /** Readings (kana/romaji/other) from every vocabulary row sharing this word -- same reasoning. */
  all_word_readings: string[] | null;
  /** Sibling kanji (not the target) in this word whose specific reading the student has already mastered -- furigana can be hidden for them. kanji_reading cards only. */
  known_kanji_chars: string[] | null;
  /** The character shown for hiragana_reading/katakana_reading cards. */
  kana_character: string | null;
  /** The expected typed romaji answer for hiragana_reading/katakana_reading cards. */
  kana_romaji: string | null;
  /** How many times in a row this hiragana_reading/katakana_reading card has been answered
   * correctly during its post-introduction drill so far (see ReviewCardKanaReading) -- null for
   * every other exercise_type, and for a kana card that isn't currently mid-drill. */
  drill_streak: number | null;
  rating_previews: RatingPreviews;
  /** 'learning' on a hiragana_reading/katakana_reading card means it's still in the
   * post-introduction drill (see ReviewCardKanaReading) -- no Hard/Good/Easy buttons, graded
   * purely correct/incorrect, repeats until answered right 3 times in a row. Every other
   * exercise_type/status combination keeps the normal rating flow. */
  status: ProgressStatus;
}

export interface NewKanjiCandidate {
  id: number;
  kanji: string;
  meanings: string[] | null;
  level: string | null;
  kun_readings: string[] | null;
  on_readings: string[] | null;
  /** How many kanji_reading ("Word reading") cards introducing this kanji will produce --
   * known up front from kanji_detail_words, independent of `words` below (which carries their
   * actual content, fetched separately/lazily). Used to predict the day's whole total before
   * this candidate is ever introduced -- see computePredictedTotal in lib/data/studyQueue.ts. */
  word_count: number;
  words: NewKanjiIntroWord[];
}

export interface NewVocabCandidate {
  id: number;
  word: string;
  kana_reading: string | null;
  meanings: string[] | null;
  parts_of_speech: string[] | null;
  jlpt_level: string | null;
  usually_kana: boolean | null;
  furiganas: string[] | null;
}

export interface NewHiraganaCandidate {
  id: number;
  character: string;
  romaji: string;
  gojuon_row: string;
}

export interface NewKatakanaCandidate {
  id: number;
  character: string;
  romaji: string;
  gojuon_row: string;
}

/** Browse's richer row shape -- unlike NewHiraganaCandidate/NewKatakanaCandidate (which mirror
 * exactly what get_new_hiragana_candidates/get_new_katakana_candidates return for the intro
 * flow), Browse reads the reference tables directly and needs the orthography-rule metadata
 * added in 20260903_kana_orthography_rules.sql/20260903_kana_orthography_rules_expansion.sql to
 * split the page into sections. */
export interface BrowseKanaEntry {
  id: number;
  character: string;
  romaji: string;
  gojuon_row: string;
  kana_type:
    | "seion"
    | "dakuten"
    | "handakuten"
    | "yoon"
    | "sokuon"
    | "choonpu"
    | "extended"
    | "n_gemination"
    | "rendaku"
    | "particle_reading"
    | "historical";
  entry_kind: "character" | "rule" | "example";
  sound_origin: "native" | "loanword";
  frequency_tier: "core" | "rare" | "very_rare" | "historical";
  notes: string | null;
}

export interface StudyQueueResponse {
  due_cards: DueCard[];
  new_kanji_to_introduce: NewKanjiCandidate[];
  new_vocab_to_introduce: NewVocabCandidate[];
  new_hiragana_to_introduce: NewHiraganaCandidate[];
  new_katakana_to_introduce: NewKatakanaCandidate[];
  next_due_at: string | null;
  /** Status of the row next_due_at belongs to -- see NextDue in lib/srs/nextDue.ts.
   * 'learning'/'relearning' means it's an SRS retry the user already triggered (rating a card
   * wrong grows the bar for it instantly via resurfaces_today, so a countdown for the same card
   * is redundant); 'review' means an independent, long-scheduled card becoming due on its own,
   * which the bar has no other way to announce -- see QueueProgressBar. */
  next_due_status: string | null;
  /** Manually flagged accounts (see 20260815_undo_disabled_flag.sql) lose the Undo button on /study. */
  undo_disabled: boolean;
  /** How many cards there are to get through today in total, counting not-yet-created future
   * cards (a New kanji's meaning + word readings, a New word's Vocabulary card, a New
   * hiragana/katakana's reading card) as already certain -- see computePredictedTotal. Drives
   * the /study progress bar's denominator so it's accurate from the very first paint instead of
   * jumping every time a bundle/batch actually materializes. */
  predicted_total: number;
}

export interface WeeklyActivityDay {
  /** Local calendar date (YYYY-MM-DD) in the user's timezone. */
  date: string;
  active: boolean;
}

export interface LevelProgressCategory {
  /** Introduced at least once (has a progress row). */
  seen: number;
  /** Graduated past the initial learning phase at least once (status review/relearning). */
  learned: number;
  /** Total items that exist at this level. */
  total: number;
}

export interface LevelProgress {
  /** The student's current (most advanced enabled) JLPT level. */
  level: JlptLevel;
  kanji: LevelProgressCategory;
  /** Vocabulary entries used to drill a kanji's reading (kanji_detail_words). */
  kanji_reading: LevelProgressCategory;
  vocabulary: LevelProgressCategory;
  /** No JLPT level of their own -- identical regardless of `level`. */
  hiragana_reading: LevelProgressCategory;
  katakana_reading: LevelProgressCategory;
}

export interface StudyStats {
  study_track: StudyTrack;
  /** Which of the four categories are actually enabled for this user right now -- e.g. on the
   * kana track, study_katakana stays false until every hiragana has graduated to review, so a
   * "remaining today" count must gate on these instead of assuming every category on the track
   * is already active. */
  study_kanji: boolean;
  study_vocabulary: boolean;
  study_hiragana: boolean;
  study_katakana: boolean;
  due_today: number;
  /** Due cards still mid-ladder (status learning/relearning) -- resurface later today. Subset of due_today. */
  due_learning: number;
  /** Due cards in the long-interval review phase (status review) -- won't come back until a future day. Subset of due_today. */
  due_review: number;
  /** Cards already reviewed today, across all categories. */
  reviewed_today: number;
  new_kanji_today: number;
  new_kanji_limit: number;
  /** How many kanji_reading ("Word reading") cards the still-pending new-kanji candidates
   * (new_kanji_limit - new_kanji_today of them) will produce once introduced -- known up front
   * from kanji_detail_words alone (see get_new_kanji_candidates' word_count), same source
   * computePredictedTotal in lib/data/studyQueue.ts uses for the /study progress bar. Needed
   * because each candidate contributes a variable number of cards (1 kanji_meaning + N
   * kanji_reading, N varying per kanji), unlike vocab/hiragana/katakana which are a flat 2 cards
   * each -- so cardsRemainingToday can't derive this from new_kanji_limit/new_kanji_today alone. */
  new_kanji_pending_review_cards: number;
  new_vocab_today: number;
  new_vocab_limit: number;
  new_hiragana_today: number;
  new_hiragana_limit: number;
  new_katakana_today: number;
  new_katakana_limit: number;
  /** Current unbroken run of days studied, ending today. */
  streak: number;
  /** Raw per-day activity for the last 7 local days, oldest first, ending today -- independent of `streak`. */
  weekly_activity: WeeklyActivityDay[];
  retention_rate: number | null;
  next_due_at: string | null;
  next_due_is_today: boolean;
  /** Status of the row next_due_at belongs to -- see NextDue in lib/srs/nextDue.ts. Lets a
   * caller distinguish "an SRS retry from earlier this session is about to resurface" (not
   * news) from "an independent, long-scheduled review just became due" (worth surfacing). */
  next_due_status: string | null;
  /** Null only if the user has no study settings row yet (shouldn't happen once onboarded). */
  level_progress: LevelProgress | null;
}

export type Rating = 0 | 1 | 2 | 3;

export interface ReviewRequestBody {
  exercise_type: ExerciseType;
  kanji_id?: number;
  word_id?: number;
  kanji_word_id?: number;
  hiragana_id?: number;
  katakana_id?: number;
  rating: Rating;
  user_answer?: string;
  /** The study_sessions row this review belongs to, if any -- passed straight through from the
   * client's own session id instead of having submit_review guess it from timing (see
   * supabase/migrations/20260821_submit_review_explicit_session_id.sql). */
  session_id?: number;
}

export interface SubmitReviewResult {
  /** review_logs.id for the row just inserted -- pass this to undoReview so it targets exactly this review. */
  reviewLogId: number;
  /** Authoritative -- computed by submit_review itself from the row's actual new status, not
   * predicted client-side. True unless this rating graduated the card to status='review'
   * (whose intervals are always at least a day) -- see
   * 20260901_submit_review_resurfaces_today.sql. useStudyQueue's rate() uses this to grow the
   * predicted daily total by the one extra attempt this card now needs later today. */
  resurfacesToday: boolean;
}

export interface StudySessionStart {
  session_id: number;
  started_at: string;
}

export interface StudySessionEnd {
  id: number;
  user_id: string;
  started_at: string;
  ended_at: string;
  cards_reviewed: number;
  cards_correct: number;
  new_cards_learned: number;
  duration_seconds: number;
  accuracy: number | null;
  next_due_at: string | null;
  next_due_is_today: boolean;
}
