import { FaFire, FaSnowflake } from "react-icons/fa6";
import type { CSSProperties } from "react";
import type { WeeklyActivityDay } from "@/lib/types";

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", { weekday: "narrow", timeZone: "UTC" });

// `date` is a plain YYYY-MM-DD local day from get_review_activity; parsed as UTC so the
// browser's own timezone doesn't shift it back a day.
function weekdayLabel(date: string) {
  return WEEKDAY_FORMATTER.format(new Date(`${date}T00:00:00Z`));
}

// SWAY_STYLE_CLASS is written as a complete, literal class string (not built up at
// runtime) so Tailwind's content scanner can find and generate it -- it only sees the
// source text, not the evaluated result of a template expression.
//
// The sway keyframes run once on the row (the .vici-flame-row-sway* classes below) and
// drive a shared CSS custom property; each flame just reads it via var() so every flame
// sways in the same phase regardless of when it individually mounts or paints -- there's
// no per-flame animation clock left to drift out of sync.
const SWAY_STYLE_CLASS = "origin-bottom [transform:rotate(var(--vici-flame-rotate))]";

// Every animation speed below lives in exactly one of these two constants -- change either
// one and everything that depends on it (the row's inline animationDuration, and the wave
// math further down) follows automatically. They're plain numbers rather than baked into a
// Tailwind class string specifically so that's true: Tailwind's content scanner needs a
// complete literal class name at build time, so a class like `animate-[..._0.6s_...]` can't
// have its duration come from a template expression -- see globals.css for the
// .vici-flame-row-sway / .vici-flame-row-sway-glow classes these durations get applied to.
const SWAY_DURATION_S = 0.6;
const GLOW_PHASE_PERIOD_S = 3;

const ROW_SWAY_CLASS = "vici-flame-row-sway";
const ROW_SWAY_AND_GLOW_CLASS = "vici-flame-row-sway-glow";

// The glow wave uses the same "one shared clock" trick as the sway above, so it's immune
// to the same kind of desync (see globals.css for the vici-flame-glow-phase animation and
// the .vici-flame-glow-wave rule that consumes it). Each flame just adds its own *static*
// --vici-flame-wave-offset (radians, set inline below) to the shared phase -- a fixed,
// render-time-independent value, so a flame that mounts late still lands in the right spot
// in the wave instead of starting its own delayed countdown.
const GLOW_WAVE_STEP_S = 0.18;
const GLOW_WAVE_STEP_RAD = (GLOW_WAVE_STEP_S / GLOW_PHASE_PERIOD_S) * 2 * Math.PI;

interface WeekStreakProps {
  /** Raw per-day activity for the last 7 days, oldest first, ending today. */
  activity: WeeklyActivityDay[];
  /** Current unbroken streak ending today -- at 7+ the whole strip lights up gold. */
  streak: number;
}

export function WeekStreak({ activity, streak }: WeekStreakProps) {
  if (activity.length === 0) return null;
  const todayIndex = activity.length - 1;
  const milestone = streak >= 7;

  const rowAnimationClass = milestone ? ROW_SWAY_AND_GLOW_CLASS : ROW_SWAY_CLASS;
  // .vici-flame-row-sway-glow's animation-name is "sway, glow-phase" (globals.css), so
  // when both are running the duration list has to supply them in that same order.
  const rowAnimationStyle: CSSProperties = {
    animationDuration: milestone ? `${SWAY_DURATION_S}s, ${GLOW_PHASE_PERIOD_S}s` : `${SWAY_DURATION_S}s`,
  };

  return (
    <div
      className={`flex flex-wrap sm:flex-row items-center justify-center gap-1 border-t border-border-soft sm:border-none pt-2 sm:pt-0 sm:mt-0 ${rowAnimationClass}`}
      style={rowAnimationStyle}
    >
      {activity.map((day, i) => {
        const isToday = i === todayIndex;
        // A free day only ever shows as its own frost icon outside the gold milestone and
        // outside "today" (which always keeps its own erased/active shading below, regardless
        // of whether it happened to be forgiven) -- once milestone takes over every day reads
        // as a solid gold flame, same as an actually-active day.
        const isFreeDay = !milestone && !isToday && day.freeDay;

        let flameColor: string;
        let lit: boolean;
        if (milestone) {
          flameColor = "text-accent-gold";
          lit = true;
        } else if (isToday) {
          // `day.active` for today is "reviewed at least one card today" (from
          // get_review_activity), same signal every other day uses -- just kept in its own
          // branch so an inactive today still shows the erased shade (lit) instead of gray (unlit).
          flameColor = day.active ? "text-accent-red" : "text-[#632738]";
          lit = true;
        } else {
          flameColor = day.active ? "text-accent-red" : "text-gray-600";
          lit = day.active;
        }

        // Every lit flame gently sways (in sync -- see ROW_SWAY_CLASS above); once the
        // streak hits the 7-day gold milestone, a glow pulse layers on top, staggered
        // left-to-right into a wave (see GLOW_WAVE_STEP_RAD above). The offset is negative
        // because a *larger* phase is a *later* point in time -- flame i should peak later
        // than flame 0, so its offset has to pull the phase argument back, not push it
        // forward (see the vici-flame-glow-phase comment in globals.css for the derivation).
        const styleClass = !lit ? "" : milestone ? `${SWAY_STYLE_CLASS} vici-flame-glow-wave` : SWAY_STYLE_CLASS;
        const glowStyle = milestone
          ? ({ "--vici-flame-wave-offset": -i * GLOW_WAVE_STEP_RAD } as CSSProperties)
          : undefined;

        const labelColor = isToday ? "text-white" : "text-text-muted";

        return (
          <div key={day.date} className="flex flex-col items-center gap-1.5">
            {isFreeDay ? (
              <FaSnowflake className="h-8 w-8 text-accent-blue" />
            ) : (
              <FaFire className={`h-8 w-8 ${flameColor} ${styleClass}`} style={glowStyle} />
            )}
            <span className={`text-[11px] ${isToday ? "font-semibold " : ""}${labelColor}`}>
              {weekdayLabel(day.date)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
