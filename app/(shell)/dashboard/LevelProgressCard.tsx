"use client";

import { Fragment, useRef } from "react";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { useInView } from "@/lib/useInView";
import { AnimatedRingStroke, RingTrack } from "@/app/components/ui/AnimatedRing";
import type { KanaRuleProgress, LevelProgress, LevelProgressCategory } from "@/lib/types";

// Shown for each ring/legend row before the real level_progress has loaded --
// pct(0, 0) is 0, so this reads as "0% / 0%" rather than a skeleton.
const EMPTY_CATEGORY: LevelProgressCategory = { seen: 0, learned: 0, total: 0 };

const SIZE = 150;
const STROKE = 9;
const GAP = 6;
const CENTER = SIZE / 2;

type RingKey = keyof Pick<LevelProgress, "kanji" | "kanji_reading" | "vocabulary">;
// strokeDim is spelled out as its own literal (not computed as `${stroke}/35` at runtime) because
// Tailwind's static scanner only generates a class for opacity-modifier syntax ("stroke-x/35")
// that appears as a literal substring somewhere in source -- a runtime-concatenated one silently
// produces no CSS at all (same reasoning as text/textDim already being separate literals below).
type RingSpec = { key: RingKey; label: string; dot: string; stroke: string; strokeDim: string; text: string; textDim: string };

// Outermost first -- each ring nests inside the previous one, sharing a center.
const STANDARD_RINGS: RingSpec[] = [
  { key: "kanji", label: "Kanji meaning", dot: "bg-accent-violet", stroke: "stroke-accent-violet", strokeDim: "stroke-accent-violet/35", text: "text-accent-violet", textDim: "text-accent-violet/70" },
  { key: "kanji_reading", label: "Kanji reading", dot: "bg-accent-blue", stroke: "stroke-accent-blue", strokeDim: "stroke-accent-blue/35", text: "text-accent-blue", textDim: "text-accent-blue/70" },
  { key: "vocabulary", label: "Vocabulary", dot: "bg-accent-orange", stroke: "stroke-accent-orange", strokeDim: "stroke-accent-orange/35", text: "text-accent-orange", textDim: "text-accent-orange/70" },
];

// Bigger than STANDARD_RINGS -- the hiragana/katakana rule breakdown nests up to 8 rings (see
// KATAKANA_RULE_RINGS) instead of 3, so the original SIZE would push the innermost ring's radius
// negative. Both cards below share this constant even though hiragana only uses 6 of the 8
// possible ring slots.
const KANA_SIZE = 220;
const KANA_CENTER = KANA_SIZE / 2;

// Stroke/gap shrink as more rule rings unlock (see visibleRings in KanaProgressCard) so a fresh
// account with only its base ring gets one bold ring instead of a thin sliver lost in a mostly
// empty 220x220 viewBox, while a fully-unlocked script still gets the original thin nested look.
// KANA_REFERENCE_RING_COUNT is hiragana's full rule count -- thickness bottoms out there; katakana's
// 2 extra rings (choonpu, extended) keep shrinking past it, floored so they stay visible.
const KANA_STROKE_MAX = 22;
const KANA_STROKE_MIN = 6;
const KANA_GAP_MIN = 4;
const KANA_REFERENCE_RING_COUNT = 6;

function kanaStrokeWidth(ringCount: number): number {
  const t = (Math.max(ringCount, 1) - 1) / (KANA_REFERENCE_RING_COUNT - 1);
  return Math.max(KANA_STROKE_MAX - t * (KANA_STROKE_MAX - KANA_STROKE_MIN), 4);
}

function kanaGap(ringCount: number): number {
  return kanaStrokeWidth(ringCount) * (KANA_GAP_MIN / KANA_STROKE_MIN);
}

type KanaRingSpec = { key: string; label: string; dot: string; stroke: string; strokeDim: string; text: string; textDim: string };

// Each rule's color is shared across both cards where the rule itself is shared (Ten-Ten, Maru,
// Combined Sounds, Double Consonants) so the same linguistic rule always reads as the same color
// regardless of script -- except n_gemination and the two scripts' own "base" ring, which had to
// double up somewhere since there are 9 distinct rings across the two cards (2 base + 5 shared
// rules + 2 katakana-only) but only 8 accent colors (6 existing + accent-pink/accent-indigo,
// added for this). The two cards are never shown side by side in the same ring stack, so a color
// repeating between them (n_gemination orange on hiragana vs. katakana's own base orange) reads
// fine in practice -- each card's legend spells out the label regardless.
const HIRAGANA_RULE_RINGS: KanaRingSpec[] = [
  { key: "seion", label: "Hiragana", dot: "bg-accent-violet", stroke: "stroke-accent-violet", strokeDim: "stroke-accent-violet/35", text: "text-accent-violet", textDim: "text-accent-violet/70" },
  { key: "dakuten", label: "Ten-Ten", dot: "bg-accent-blue", stroke: "stroke-accent-blue", strokeDim: "stroke-accent-blue/35", text: "text-accent-blue", textDim: "text-accent-blue/70" },
  { key: "handakuten", label: "Maru", dot: "bg-accent-gold", stroke: "stroke-accent-gold", strokeDim: "stroke-accent-gold/35", text: "text-accent-gold", textDim: "text-accent-gold/70" },
  { key: "yoon", label: "Combined Sounds", dot: "bg-accent-green", stroke: "stroke-accent-green", strokeDim: "stroke-accent-green/35", text: "text-accent-green", textDim: "text-accent-green/70" },
  { key: "sokuon", label: "Double Consonants", dot: "bg-accent-red", stroke: "stroke-accent-red", strokeDim: "stroke-accent-red/35", text: "text-accent-red", textDim: "text-accent-red/70" },
  { key: "n_gemination", label: "Double N Sound", dot: "bg-accent-orange", stroke: "stroke-accent-orange", strokeDim: "stroke-accent-orange/35", text: "text-accent-orange", textDim: "text-accent-orange/70" },
];

const KATAKANA_RULE_RINGS: KanaRingSpec[] = [
  { key: "seion", label: "Katakana", dot: "bg-accent-orange", stroke: "stroke-accent-orange", strokeDim: "stroke-accent-orange/35", text: "text-accent-orange", textDim: "text-accent-orange/70" },
  { key: "dakuten", label: "Ten-Ten", dot: "bg-accent-blue", stroke: "stroke-accent-blue", strokeDim: "stroke-accent-blue/35", text: "text-accent-blue", textDim: "text-accent-blue/70" },
  { key: "handakuten", label: "Maru", dot: "bg-accent-gold", stroke: "stroke-accent-gold", strokeDim: "stroke-accent-gold/35", text: "text-accent-gold", textDim: "text-accent-gold/70" },
  { key: "yoon", label: "Combined Sounds", dot: "bg-accent-green", stroke: "stroke-accent-green", strokeDim: "stroke-accent-green/35", text: "text-accent-green", textDim: "text-accent-green/70" },
  { key: "sokuon", label: "Double Consonants", dot: "bg-accent-red", stroke: "stroke-accent-red", strokeDim: "stroke-accent-red/35", text: "text-accent-red", textDim: "text-accent-red/70" },
  { key: "n_gemination", label: "Double N Sound", dot: "bg-accent-violet", stroke: "stroke-accent-violet", strokeDim: "stroke-accent-violet/35", text: "text-accent-violet", textDim: "text-accent-violet/70" },
  { key: "choonpu", label: "Long Vowels", dot: "bg-accent-pink", stroke: "stroke-accent-pink", strokeDim: "stroke-accent-pink/35", text: "text-accent-pink", textDim: "text-accent-pink/70" },
  { key: "extended", label: "Foreign Sound Combos", dot: "bg-accent-indigo", stroke: "stroke-accent-indigo", strokeDim: "stroke-accent-indigo/35", text: "text-accent-indigo", textDim: "text-accent-indigo/70" },
];

function pct(seen: number, total: number): number {
  return total > 0 ? Math.round((seen / total) * 100) : 0;
}

function radiusFor(index: number): number {
  return CENTER - 4 - STROKE / 2 - index * (STROKE + GAP);
}

function radiusForKana(index: number, strokeWidth: number, gap: number): number {
  return KANA_CENTER - 4 - strokeWidth / 2 - index * (strokeWidth + gap);
}

function findRule(rules: KanaRuleProgress[] | undefined, kanaType: string): LevelProgressCategory {
  return rules?.find((r) => r.kana_type === kanaType) ?? EMPTY_CATEGORY;
}

function LevelRing({
  center,
  radius,
  strokeWidth,
  seenPct,
  learnedPct,
  strokeClass,
  strokeDimClass,
  inView,
}: {
  center: number;
  radius: number;
  strokeWidth: number;
  seenPct: number;
  learnedPct: number;
  strokeClass: string;
  strokeDimClass: string;
  inView: boolean;
}) {
  return (
    <g>
      <RingTrack cx={center} cy={center} radius={radius} strokeWidth={strokeWidth} />
      <AnimatedRingStroke
        cx={center}
        cy={center}
        radius={radius}
        strokeWidth={strokeWidth}
        percent={seenPct}
        inView={inView}
        className={strokeDimClass}
      />
      <AnimatedRingStroke
        cx={center}
        cy={center}
        radius={radius}
        strokeWidth={strokeWidth}
        percent={learnedPct}
        inView={inView}
        className={strokeClass}
      />
    </g>
  );
}

/** One hiragana- or katakana-only progress card: a concentric ring stack (one ring per kana_type,
 * outermost = the script's own base ring) plus the same seen/learned legend STANDARD_RINGS uses --
 * see LevelProgressCard for why this replaced the old single combined hiragana/katakana card. */
function KanaProgressCard({
  centerLabel,
  rings,
  rules,
  ariaLabel,
}: {
  centerLabel: string;
  rings: KanaRingSpec[];
  rules: KanaRuleProgress[] | undefined;
  ariaLabel: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [ringsRef, ringsInView] = useInView<HTMLDivElement>();

  // The base script ring (seion) always shows -- every other rule ring only appears once the
  // user has seen at least one card from it, so untouched rules (e.g. dakuten before the user
  // has reached any が/ざ/だ/ば cards) don't clutter the ring stack or legend with a permanent 0%.
  const visibleRings = rings.filter((ring) => ring.key === "seion" || findRule(rules, ring.key).seen > 0);
  const kanaStroke = kanaStrokeWidth(visibleRings.length);
  const kanaRingGap = kanaGap(visibleRings.length);

  return (
    <GlassCard
      ref={cardRef}
      padding="sm"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center justify-center gap-5 xl:gap-10 !cursor-default"
    >
      <div ref={ringsRef} className="relative h-[140px] w-[140px] shrink-0 xl:h-[190px] xl:w-[190px]">
        <svg viewBox={`0 0 ${KANA_SIZE} ${KANA_SIZE}`} className="h-full w-full -rotate-90">
          {visibleRings.map((ring, i) => {
            const cat = findRule(rules, ring.key);
            return (
              <LevelRing
                key={ring.key}
                center={KANA_CENTER}
                radius={radiusForKana(i, kanaStroke, kanaRingGap)}
                strokeWidth={kanaStroke}
                seenPct={pct(cat.seen, cat.total)}
                learnedPct={pct(cat.learned, cat.total)}
                strokeClass={ring.stroke}
                strokeDimClass={ring.strokeDim}
                inView={ringsInView}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-2xl font-extrabold tracking-tight">
          {centerLabel}
        </div>
      </div>

      {/* Legend */}

      <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-6 gap-y-2.5">

        <div></div>
        <div className="justify-self-center text-center text-xs text-text-muted">Seen at least once</div>
        <div className="justify-self-center text-center text-xs text-text-muted">Already learned</div>

        {visibleRings.map((ring) => {
          const cat = findRule(rules, ring.key);
          return (
            <Fragment key={ring.key}>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <span className={`h-2 w-2 shrink-0 rounded-full ${ring.dot}`} />
                {ring.label}
              </div>
              <div className={`justify-self-center text-sm font-bold ${ring.textDim}`}>
                {pct(cat.seen, cat.total)}%
              </div>
              <div className={`justify-self-center text-sm font-bold ${ring.text}`}>
                {pct(cat.learned, cat.total)}%
              </div>
            </Fragment>
          );
        })}

      </div>
    </GlassCard>
  );
}

export function LevelProgressCard() {
  // Reuses the same StudyStatsProvider poll the shell layout and DashboardHero already run —
  // no separate fetch here.
  const { stats } = useStudyStats();
  const cardRef = useRef<HTMLDivElement>(null);
  const [ringsRef, ringsInView] = useInView<HTMLDivElement>();

  // level_progress is only null once stats have loaded and the user genuinely has
  // no study settings row yet (shouldn't happen once onboarded) -- still a bail-out,
  // distinct from "stats haven't loaded yet" below.
  if (stats && !stats.level_progress) return null;

  const progress = stats?.level_progress;
  const isKana = stats?.study_track === "kana";

  // Kana track: two stacked cards (hiragana, katakana), each broken down by kana_type -- see
  // KanaProgressCard. Split out per user request instead of the single card with one ring per
  // script this used to render (still below, for the standard kanji/vocabulary track). Each card
  // is gated on its own study_hiragana/study_katakana flag -- e.g. a fresh kana-track student has
  // study_katakana still false (it only auto-activates once every hiragana is mastered, see
  // hiragana_auto_activate_katakana), so the katakana card would otherwise show a permanent 0%
  // card for a script they haven't started yet.
  if (isKana) {
    return (
      <div className="flex flex-col gap-5">
        {stats?.study_hiragana && (
          <KanaProgressCard
            centerLabel="あ"
            rings={HIRAGANA_RULE_RINGS}
            rules={progress?.hiragana_rules}
            ariaLabel="Hiragana progress details"
          />
        )}
        {stats?.study_katakana && (
          <KanaProgressCard
            centerLabel="ア"
            rings={KATAKANA_RULE_RINGS}
            rules={progress?.katakana_rules}
            ariaLabel="Katakana progress details"
          />
        )}
      </div>
    );
  }

  return (
    <GlassCard
      ref={cardRef}
      padding="sm"
      aria-label={progress ? `${progress.level} progress details` : "Level progress details"}
      className={`flex flex-wrap items-center justify-center gap-5 xl:gap-10 !cursor-default`}
    >
      <div ref={ringsRef} className="relative h-[110px] w-[110px] shrink-0 xl:h-[150px] xl:w-[150px]">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full -rotate-90">
          {STANDARD_RINGS.map((ring, i) => {
            const cat = progress ? progress[ring.key] : EMPTY_CATEGORY;
            return (
              <LevelRing
                key={ring.key}
                center={CENTER}
                radius={radiusFor(i)}
                strokeWidth={STROKE}
                seenPct={pct(cat.seen, cat.total)}
                learnedPct={pct(cat.learned, cat.total)}
                strokeClass={ring.stroke}
                strokeDimClass={ring.strokeDim}
                inView={ringsInView}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-2xl font-extrabold tracking-tight">
          {progress?.level ?? ""}
        </div>
      </div>

      {/* Legend */}

      <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-6 gap-y-2.5">

        <div></div>
        <div className="justify-self-center text-center text-xs text-text-muted">Seen at least once</div>
        <div className="justify-self-center text-center text-xs text-text-muted">Already learned</div>

        {STANDARD_RINGS.map((ring) => {
          const cat = progress ? progress[ring.key] : EMPTY_CATEGORY;
          return (
            <Fragment key={ring.key}>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <span className={`h-2 w-2 shrink-0 rounded-full ${ring.dot}`} />
                {ring.label}
              </div>
              <div className={`justify-self-center text-sm font-bold ${ring.textDim}`}>
                {pct(cat.seen, cat.total)}%
              </div>
              <div className={`justify-self-center text-sm font-bold ${ring.text}`}>
                {pct(cat.learned, cat.total)}%
              </div>
            </Fragment>
          );
        })}

      </div>
    </GlassCard>
  );
}
