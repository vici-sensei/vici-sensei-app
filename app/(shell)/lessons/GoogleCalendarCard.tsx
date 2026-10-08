"use client";

import { useState } from "react";
import { FaArrowUpRightFromSquare, FaCalendarCheck } from "react-icons/fa6";
import { Button } from "@/app/components/ui/Button";
import { useToast } from "@/app/components/ui/Toast";
import { lessonErrorMessage } from "@/lib/client-data/lessons";
import type { GoogleCalendarState } from "@/lib/client-data/lessonsGoogle";
import { timeAgo } from "@/lib/lessons/notifications";

/** "Add my lessons to Google Calendar". The calendar belongs to the app and is shared with the student read-only,
 * so what they see cannot be changed by mistake; it updates by itself within a few minutes of any change. */
export function GoogleCalendarCard({
  state,
  nowMs,
  onEnable,
  onDisable,
}: {
  state: GoogleCalendarState | null;
  nowMs: number;
  onEnable: () => Promise<unknown>;
  onDisable: () => Promise<unknown>;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmingStop, setConfirmingStop] = useState(false);
  if (!state || !state.configured) return null;

  const run = async (task: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await task();
      showToast(success);
      setConfirmingStop(false);
    } catch (err) {
      showToast(lessonErrorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-border-soft bg-bg-cards p-5">
      <h3 className="flex items-center gap-2 text-base font-extrabold">
        <FaCalendarCheck className="text-accent-blue" aria-hidden="true" />
        Google Calendar
      </h3>

      {!state.enabled ? (
        <>
          <p className="mt-2 text-[0.84rem] leading-normal text-text-muted">
            See your lessons next to everything else in Google Calendar. We make a calendar just for you and share it with your account&rsquo;s Gmail address. You can
            see it, but you can&rsquo;t change it by mistake, and it updates by itself when a lesson is cancelled, moved or booked.
          </p>
          <Button size="sm" className="mt-3" loading={busy} onClick={() => void run(onEnable, "Done. Check your Gmail for the invitation from Google.")}>
            Add to Google Calendar
          </Button>
        </>
      ) : !state.calendar_id ? (
        <p className="mt-2 text-[0.84rem] leading-normal text-text-muted">Setting up your calendar. This takes a few minutes; you&rsquo;ll get an invitation from Google by email.</p>
      ) : (
        <>
          <p className="mt-2 text-[0.84rem] leading-normal text-text-muted">
            Your lessons calendar is on{state.shared_with ? <> and shared with {state.shared_with}</> : null}. Google emails you an invitation the first time: accept it once and the
            calendar shows up in your list.
            {state.synced_at ? ` Last updated ${timeAgo(Date.parse(state.synced_at), nowMs)}.` : " It fills in within a few minutes."}
          </p>
          {state.last_error ? <p className="mt-1 text-[0.8rem] text-accent-orange">It couldn&rsquo;t be updated just now. We&rsquo;ll try again.</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {state.calendar_link ? (
              <a
                href={state.calendar_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-[0.86rem] font-bold text-accent-blue hover:underline"
              >
                <FaArrowUpRightFromSquare aria-hidden="true" />
                Open in Google Calendar
              </a>
            ) : null}
            {confirmingStop ? (
              <span className="flex items-center gap-2">
                <span className="text-[0.84rem]">Remove the calendar?</span>
                <Button size="sm" danger loading={busy} onClick={() => void run(onDisable, "Your Google calendar was removed.")}>
                  Yes, remove it
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmingStop(false)}>
                  Keep it
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setConfirmingStop(true)}>
                Stop
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
