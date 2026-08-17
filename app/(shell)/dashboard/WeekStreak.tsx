import { FaFire } from "react-icons/fa6";
import type { WeeklyActivityDay } from "@/lib/types";

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", { weekday: "narrow", timeZone: "UTC" });

// `date` is a plain YYYY-MM-DD local day from get_review_activity; parsed as UTC so the
// browser's own timezone doesn't shift it back a day.
function weekdayLabel(date: string) {
  return WEEKDAY_FORMATTER.format(new Date(`${date}T00:00:00Z`));
}

function isSunday(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
}

function isSaturday(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 6;
}

// Written as complete, literal class strings (not built up at runtime) so Tailwind's
// content scanner can find and generate them -- it only sees the source text, not the
// evaluated result of a template expression.
const SWAY_CLASS = "origin-bottom animate-[vici-flame-sway_0.6s_ease-in-out_infinite_alternate]";
const SWAY_AND_GLOW_CLASS =
  "origin-bottom animate-[vici-flame-sway_0.6s_ease-in-out_infinite_alternate,vici-flame-glow_1s_ease-in-out_infinite]";

interface WeekStreakProps {
  /** Raw per-day activity for the last 7 days, oldest first, ending today. */
  activity: WeeklyActivityDay[];
  /** Current unbroken streak ending today -- at 7+ the whole strip lights up gold. */
  streak: number;
  /** True once every due/new card for today has been studied. */
  todayDone: boolean;
}

export function WeekStreak({ activity, streak, todayDone }: WeekStreakProps) {
  if (activity.length === 0) return null;
  const todayIndex = activity.length - 1;
  const milestone = streak >= 7;

  return (
    <div className="flex items-center justify-between gap-1 border-t border-border-soft sm:border-none pt-2 sm:pt-0 sm:mt-0">
      {activity.map((day, i) => {
        const isToday = i === todayIndex;
        const sunday = isSunday(day.date);
        const saturday = isSaturday(day.date);

        let flameColor: string;
        let lit: boolean;
        if (milestone) {
          flameColor = "text-accent-gold";
          lit = true;
        } else if (isToday) {
          flameColor = todayDone ? "text-accent-red" : "text-accent-red/35";
          lit = true;
        } else {
          flameColor = day.active ? "text-accent-red" : "text-text-muted/50";
          lit = day.active;
        }

        // Every lit flame gently sways; once the streak hits the 7-day gold milestone,
        // a glow pulse layers on top of the sway.
        const animationClass = !lit ? "" : milestone ? SWAY_AND_GLOW_CLASS : SWAY_CLASS;

        const labelColor = sunday ? "text-white" : "text-text-muted";

        return (
          <div key={day.date} className="flex flex-col items-center gap-1.5">
            <FaFire
              className={`h-8 w-8 ${flameColor} ${animationClass}`}
              style={lit ? { animationDelay: `${i * 0.15}s` } : undefined}
            />
            <span className={`text-[11px] ${isToday || saturday ? "font-semibold " : ""}${labelColor}`}>
              {weekdayLabel(day.date)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
