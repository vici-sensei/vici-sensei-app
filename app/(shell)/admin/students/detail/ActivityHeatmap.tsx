import type { StudentDailyActivity } from "@/lib/types";

const DAYS_SHOWN = 84; // 12 full weeks
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function bucketColor(reviewsCount: number): string {
  if (reviewsCount <= 0) return "bg-white/[0.05]";
  if (reviewsCount < 10) return "bg-accent-red/30";
  if (reviewsCount < 25) return "bg-accent-red/60";
  return "bg-accent-red";
}

/** GitHub-contribution-graph-style grid, most recent day last (bottom-right) -- WeekStreak's
 *  flame strip only ever shows a fixed 7 days and isn't a grid, so this is a new small
 *  component rather than an extension of it (see admin plan). */
export function ActivityHeatmap({ days }: { days: StudentDailyActivity[] }) {
  const byDay = new Map(days.map((d) => [d.day, d]));

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const cells: { key: string; reviewsCount: number }[] = [];
  for (let i = DAYS_SHOWN - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - i);
    const key = toDateKey(date);
    cells.push({ key, reviewsCount: byDay.get(key)?.reviews_count ?? 0 });
  }

  // Pad the front so the grid always starts on a Sunday column, matching WEEKDAY_LABELS.
  const leadingBlanks = new Date(cells[0].key).getUTCDay();
  const columns: ({ key: string; reviewsCount: number } | null)[][] = [];
  let column: ({ key: string; reviewsCount: number } | null)[] = new Array(leadingBlanks).fill(null);
  for (const cell of cells) {
    column.push(cell);
    if (column.length === 7) {
      columns.push(column);
      column = [];
    }
  }
  if (column.length > 0) columns.push(column);

  return (
    <div className="flex gap-3">
      <div className="flex flex-col gap-1 pt-[18px]">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i} className="h-3 text-[10px] leading-3 text-text-muted">
            {i % 2 === 1 ? label : ""}
          </span>
        ))}
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {columns.map((col, i) => (
          <div key={i} className="flex flex-col gap-1">
            {i === 0 || columns[i - 1]?.[0]?.key.slice(0, 7) !== col[0]?.key.slice(0, 7) ? (
              <span className="h-3 text-[10px] leading-3 text-text-muted">
                {col[0] ? new Date(col[0].key).toLocaleDateString(undefined, { month: "short" }) : ""}
              </span>
            ) : (
              <span className="h-3" />
            )}
            {col.map((cell, j) =>
              cell ? (
                <div
                  key={cell.key}
                  title={`${cell.key}: ${cell.reviewsCount} review${cell.reviewsCount === 1 ? "" : "s"}`}
                  className={`h-3 w-3 rounded-[3px] ${bucketColor(cell.reviewsCount)}`}
                />
              ) : (
                <div key={j} className="h-3 w-3" />
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
