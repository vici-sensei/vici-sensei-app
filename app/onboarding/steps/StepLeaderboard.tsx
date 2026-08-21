import { LeaderboardList } from "@/app/(shell)/leaderboard/LeaderboardList";
import { LeaderboardAliasDice } from "@/app/(settings)/settings/study/LeaderboardAliasDice";
import type { LeaderboardAlias, LeaderboardEntry } from "@/lib/types";

// Fictional rows so the preview always looks like a populated leaderboard,
// regardless of how new this account actually is.
const MOCK_OTHERS: Omit<LeaderboardEntry, "rank">[] = [
  { user_id: "mock-1", display_name: "Emma Johnson", avatar_url: null, country: "US", is_premium: true, score: 842 },
  { user_id: "mock-2", display_name: "Lucas Fernandez", avatar_url: null, country: "ES", is_premium: false, score: 710 },
  { user_id: "mock-3", display_name: "Amara Okafor", avatar_url: null, country: "NG", is_premium: false, score: 655 },
  { user_id: "mock-4", display_name: "Marie Dubois", avatar_url: null, country: "FR", is_premium: false, score: 598 },
];

export function StepLeaderboard({
  anonymous,
  onChange,
  userId,
  displayName,
  avatarUrl,
  country,
  leaderboardAlias,
  onReroll,
}: {
  /** `null` until the user actively picks one of the two options -- neither starts selected. */
  anonymous: boolean | null;
  onChange: (anonymous: boolean) => void;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  country: string | null;
  /** The real alias assigned in the DB once `anonymous` turns on (assign_leaderboard_alias trigger) -- null while that save is still in flight. */
  leaderboardAlias: LeaderboardAlias | null;
  onReroll: () => Promise<void>;
}) {
  const isAnonymous = anonymous === true;

  // Mirrors what get_leaderboard_*() actually does server-side once leaderboard_anonymous is
  // on: real name/photo/country are swapped for the random alias, with no photo and no flag.
  const viewerEntry: LeaderboardEntry = isAnonymous
    ? {
        user_id: userId,
        display_name: leaderboardAlias ? `${leaderboardAlias.adjective} ${leaderboardAlias.noun}` : "Anonymous Student",
        avatar_url: null,
        country: null,
        is_premium: false,
        score: 960,
        rank: 1,
      }
    : {
        user_id: userId,
        display_name: displayName.trim() || "You",
        avatar_url: avatarUrl,
        country,
        is_premium: false,
        score: 960,
        rank: 1,
      };

  const entries: LeaderboardEntry[] = [viewerEntry, ...MOCK_OTHERS.map((entry, i) => ({ ...entry, rank: i + 2 }))];

  return (
    <>
      <h1 className="mb-2 text-[1.5rem] font-extrabold tracking-[-0.5px]">
        How do you want to appear on the leaderboard?
      </h1>
      <p className="mx-auto mb-5 max-w-md text-sm leading-[1.6] text-text-muted">
        Your rank always stays visible. Anonymous swaps your name, photo, and country for a random alias.
      </p>

      <div className="mb-6 flex justify-center">
        <div className="inline-flex gap-1 rounded-full border border-border-soft bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => onChange(false)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-colors duration-200 ${
              anonymous === false
                ? "bg-accent-red text-white shadow-[0_0_15px_var(--color-accent-red-glow)]"
                : anonymous === null
                  ? "bg-white/[0.03] text-text-muted hover:text-white"
                  : "text-text-muted hover:text-white"
            }`}
          >
            With my profile
          </button>
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-colors duration-200 ${
              anonymous === true
                ? "bg-accent-red text-white shadow-[0_0_15px_var(--color-accent-red-glow)]"
                : anonymous === null
                  ? "bg-white/[0.03] text-text-muted hover:text-white"
                  : "text-text-muted hover:text-white"
            }`}
          >
            Anonymous
          </button>
        </div>
      </div>

      <div className="text-left">
        <p className="mb-2.5 text-center text-sm font-bold uppercase tracking-[0.6px] text-text-muted">Preview</p>
        {isAnonymous && (
          <div className="mb-3 flex items-center gap-3">
            <LeaderboardAliasDice onReroll={onReroll} disabled={!leaderboardAlias} />
            <p className="text-sm text-text-muted">Not feeling this name? Give the die a roll for a new one!</p>
          </div>
        )}
        <LeaderboardList entries={entries} status="loaded" metric="xp" viewerId={userId} viewerAnonymous={isAnonymous} />
      </div>
    </>
  );
}
