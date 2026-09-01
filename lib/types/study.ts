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
  /** hiragana.kana_type/katakana.kana_type for hiragana_reading/katakana_reading cards (seion,
   * dakuten, handakuten, yoon, sokuon, n_gemination, choonpu, extended) -- null for every other
   * exercise_type. Gates the post-introduction drill (see `status` below): only kana_type =
   * 'seion' cards ever use it, regardless of status. */
  kana_type: string | null;
  /** How many times in a row this hiragana_reading/katakana_reading card has been answered
   * correctly during its post-introduction drill so far (see ReviewCardKanaReading) -- null for
   * every other exercise_type, and for a kana card that isn't currently mid-drill. */
  drill_streak: number | null;
  /** True iff this card is still in the post-introduction drill (repeat until 3 correct in a
   * row, no Hard/Good/Easy buttons -- see ReviewCardKanaReading) -- computed server-side as
   * `status = 'learning' and kana_type = 'seion'` (get_due_cards/get_hiragana_reading_cards/
   * get_katakana_reading_cards, 20260911_drill_mode_and_atomic_undo.sql), always false for every
   * non-kana exercise_type. Read this instead of re-deriving the same condition from status/
   * kana_type -- useStudyQueue.ts's rate() used to recompute it separately from
   * ReviewCardKanaReading's own copy and the two drifted out of sync, silently routing a
   * Hard/Good/Easy-rated non-seion card into the drill. */
  drill_mode: boolean;
  rating_previews: RatingPreviews;
  /** 'learning' on a kana_type = 'seion' hiragana_reading/katakana_reading card means it's still
   * in the post-introduction drill (see ReviewCardKanaReading) -- no Hard/Good/Easy buttons,
   * graded purely correct/incorrect, repeats until answered right 3 times in a row. Every other
   * kana_type skips the drill entirely regardless of status (dakuten/handakuten characters and
   * every drillable example go straight to normal Hard/Good/Easy grading, same as
   * kanji_meaning/vocab_meaning) -- see 20260906_selective_examples_and_seion_only_drill.sql. */
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
  sort_order: number;
}

export interface NewKatakanaCandidate {
  id: number;
  character: string;
  romaji: string;
  gojuon_row: string;
  sort_order: number;
}

export interface KanaRuleExample {
  character: string;
  romaji: string;
  /** Used to split the example grid into per-family sub-groups (see groupByGojuonRow/
   * resolveRuleExampleRowLabel in lib/srs/gojuon.ts), same grouping Browse's RuleSubsection
   * shows -- not otherwise displayed. */
  gojuon_row: string;
}

/** A one-time, read-only "new_rule" intro card -- entry_kind = 'rule' rows in hiragana/katakana
 * (dakuten, sokuon, yoon, ...). Shown once; confirming it just marks it permanently seen (see
 * introduce_hiragana_rule/introduce_katakana_rule) -- it's never graded and never produces a
 * hiragana_reading/katakana_reading card. `examples` is the rule's illustrative row set (the
 * dedicated entry_kind = 'example' rows for sokuon/yoon/n_gemination/choonpu/extended, or the real
 * entry_kind = 'character' rows for seion/dakuten/handakuten, which have no separate examples of
 * their own) -- see get_new_hiragana_rule_candidates/get_new_katakana_rule_candidates
 * (20260904_kana_rule_cards.sql). */
export interface NewHiraganaRuleCandidate {
  id: number;
  character: string;
  notes: string | null;
  kana_type: string;
  sort_order: number;
  label: string | null;
  technical_term: string | null;
  examples: KanaRuleExample[];
}

export interface NewKatakanaRuleCandidate {
  id: number;
  character: string;
  notes: string | null;
  kana_type: string;
  sort_order: number;
  label: string | null;
  technical_term: string | null;
  examples: KanaRuleExample[];
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
    | "n_gemination";
  entry_kind: "character" | "rule" | "example";
  sound_origin: "native" | "loanword";
  frequency_tier: "core" | "rare" | "very_rare";
  notes: string | null;
}

/** Browse section heading for a kana_type -- shared by hiragana and katakana (same concept, same
 * label, regardless of script). `label` is the beginner-friendly heading; `technical_term` is the
 * Japanese linguistic term shown smaller/muted next to it. Lives in public.kana_rule_labels
 * (20260829_kana_rule_labels_table.sql) rather than hardcoded in BrowseKanaListPage.tsx so other
 * pages can reuse the same titles. */
export interface KanaRuleLabel {
  kana_type: BrowseKanaEntry["kana_type"];
  label: string;
  technical_term: string;
  sort_order: number;
}

export interface StudyQueueResponse {
  due_cards: DueCard[];
  new_kanji_to_introduce: NewKanjiCandidate[];
  new_vocab_to_introduce: NewVocabCandidate[];
  new_hiragana_to_introduce: NewHiraganaCandidate[];
  new_katakana_to_introduce: NewKatakanaCandidate[];
  new_hiragana_rules_to_introduce: NewHiraganaRuleCandidate[];
  new_katakana_rules_to_introduce: NewKatakanaRuleCandidate[];
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

/** hiragana.kana_type/katakana.kana_type this category breaks down (seion, dakuten, handakuten,
 * yoon, sokuon, n_gemination, or katakana-only choonpu/extended) plus its seen/learned/total
 * counts -- same shape as LevelProgressCategory, just tagged with which rule it's for. */
export interface KanaRuleProgress extends LevelProgressCategory {
  kana_type: string;
}

export interface LevelProgress {
  /** The student's current (most advanced enabled) JLPT level. */
  level: JlptLevel;
  kanji: LevelProgressCategory;
  /** Vocabulary entries used to drill a kanji's reading (kanji_detail_words). */
  kanji_reading: LevelProgressCategory;
  vocabulary: LevelProgressCategory;
  /** No JLPT level of their own -- identical regardless of `level`. Aggregated across every
   * kana_type -- seen/learned/total each equal the sum of the matching fields across
   * hiragana_rules/katakana_rules below. The dashboard card reads the per-rule breakdown instead
   * now, but get_level_progress still returns the aggregate too, so it stays here for any future
   * caller that just wants the total without reducing the array itself. */
  hiragana_reading: LevelProgressCategory;
  katakana_reading: LevelProgressCategory;
  /** Per-kana_type breakdown for the dashboard's hiragana progress card: seion, dakuten,
   * handakuten, yoon, sokuon, n_gemination, in that order. */
  hiragana_rules: KanaRuleProgress[];
  /** Same as hiragana_rules, plus katakana-only choonpu and extended at the end. */
  katakana_rules: KanaRuleProgress[];
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
   * (new_kanji_available of them) will produce once introduced -- known up front from
   * kanji_detail_words alone (see get_new_kanji_candidates' word_count), same source
   * computePredictedTotal in lib/data/studyQueue.ts uses for the /study progress bar. Needed
   * because each candidate contributes a variable number of cards (1 kanji_meaning + N
   * kanji_reading, N varying per kanji), unlike vocab/hiragana/katakana which are a flat 2 cards
   * each -- so cardsRemainingToday can't derive this from new_kanji_available alone. */
  new_kanji_pending_review_cards: number;
  /** How many new kanji/vocab/hiragana/katakana candidates get_new_*_candidates would actually
   * return right now -- i.e. Math.min(new_X_limit - new_X_today, however many un-introduced
   * candidates genuinely exist). new_X_limit - new_X_today alone (the daily quota still open) is
   * NOT a safe stand-in: a quota set well above the real content pool -- there's no upper bound
   * on new_X_per_day besides a >=15/step-of-5 check for kana, and none at all for kanji/vocab --
   * would make it claim far more "ready to learn" than actually exist. cardsRemainingToday and
   * DashboardHero's "N new hiragana ready to learn" text both read these instead of computing
   * their own quota arithmetic, so neither can overcount regardless of how the quota is set. */
  new_kanji_available: number;
  new_vocab_available: number;
  new_hiragana_available: number;
  new_katakana_available: number;
  new_vocab_today: number;
  new_vocab_limit: number;
  new_hiragana_today: number;
  new_hiragana_limit: number;
  new_katakana_today: number;
  new_katakana_limit: number;
  /** Current unbroken run of days studied, ending today. */
  streak: number;
  /** Longest unbroken run of days studied ever, including the current one -- never decreases. */
  streak_record: number;
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

/** Result of check_and_advance_jlpt_level (20260908_auto_advance_jlpt_level.sql), called after
 * every kanji_meaning/kanji_reading/vocab_meaning review. `leveledUp` false means nothing to
 * celebrate; true with `isMaxLevel` false means completedLevel just finished and the user's
 * enabled_levels already advanced to newLevel server-side (completedLevel stays included); true
 * with `isMaxLevel` true means N1 itself was just fully mastered, with nothing left to advance
 * to -- newLevel is null in that case. */
export interface JlptLevelUpResult {
  leveledUp: boolean;
  completedLevel: JlptLevel | null;
  newLevel: JlptLevel | null;
  isMaxLevel: boolean;
}

/** Which kana-track milestone useStudyQueue's checkKanaGraduation just detected, by comparing
 * user_study_settings before/after a hiragana_reading/katakana_reading review -- the transition
 * itself already happened server-side (hiragana_auto_activate_katakana/
 * katakana_auto_activate_standard triggers), this is purely "is there something to celebrate".
 * 'hiragana_complete': every hiragana character just reached review/relearning, so study_katakana
 * flipped false -> true. 'katakana_complete': every katakana character did too (with hiragana
 * already mastered), so study_track flipped 'kana' -> 'standard' -- the bigger milestone, moving
 * off the kana track onto kanji/vocabulary. */
export type KanaGraduationKind = "hiragana_complete" | "katakana_complete";

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
