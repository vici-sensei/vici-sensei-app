"use client";

import { useMemo, useState } from "react";
import type { DirectoryStudent, PersonRef } from "@/lib/client-data/lessonsStaff";
import { Avatar, inputClass } from "./staffUi";

/** Pick one student out of the directory: a search box and a short list under it. */
export function StudentPicker({
  students,
  value,
  onChange,
  exclude = [],
  onlyWithAccess = false,
}: {
  students: DirectoryStudent[] | null;
  value: PersonRef | null;
  onChange: (student: PersonRef | null) => void;
  /** People who are already in (shown nowhere in the list). */
  exclude?: PersonRef[];
  onlyWithAccess?: boolean;
}) {
  const [query, setQuery] = useState("");
  const skip = useMemo(() => new Set(exclude.map((p) => `${p.region}:${p.user_id}`)), [exclude]);

  const matches = useMemo(() => {
    if (!students) return [];
    const q = query.trim().toLowerCase();
    return students
      .filter((s) => !s.is_teacher && !skip.has(`${s.region}:${s.user_id}`))
      .filter((s) => !onlyWithAccess || s.lessons?.has_access)
      .filter((s) => !q || (s.display_name ?? "").toLowerCase().includes(q) || (s.email ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [students, query, skip, onlyWithAccess]);

  const selected = value && students?.find((s) => s.region === value.region && s.user_id === value.user_id);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-3 py-2">
        <span className="inline-flex min-w-0 items-center gap-2 font-bold">
          <Avatar name={selected.display_name ?? "?"} src={selected.avatar_url} />
          <span className="truncate">{selected.display_name ?? "Unnamed"}</span>
        </span>
        <button type="button" className="cursor-pointer text-[0.8rem] font-bold text-accent-blue hover:underline" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        type="search"
        className={inputClass}
        placeholder={students ? "Search by name or email" : "Loading students…"}
        value={query}
        disabled={!students}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search students"
      />
      {students && matches.length === 0 ? (
        <p className="mt-2 text-[0.8rem] text-text-muted">
          {onlyWithAccess ? "No student with lesson access matches. Give them access in the Students tab first." : "Nobody matches."}
        </p>
      ) : null}
      <ul className="mt-2 space-y-1">
        {matches.map((s) => (
          <li key={`${s.region}:${s.user_id}`}>
            <button
              type="button"
              onClick={() => onChange({ region: s.region, user_id: s.user_id })}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border-soft bg-white/[0.03] px-3 py-2 text-left text-[0.86rem] transition-colors hover:border-white/20 hover:bg-white/[0.06]"
            >
              <Avatar name={s.display_name ?? "?"} src={s.avatar_url} size={24} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{s.display_name ?? "Unnamed"}</span>
                {s.email ? <span className="block truncate text-[0.72rem] text-text-muted">{s.email}</span> : null}
              </span>
              {s.lessons?.has_access ? null : <span className="text-[0.7rem] font-bold text-text-muted">no access</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
