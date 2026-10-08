"use client";

import { useState } from "react";
import { FaBell, FaCircleInfo, FaTriangleExclamation } from "react-icons/fa6";
import type { User } from "@supabase/auth-js";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";
import { PillSelector } from "@/app/components/ui/PillSelector";
import { useToast } from "@/app/components/ui/Toast";
import { Toggle } from "@/app/components/ui/Toggle";
import { lessonErrorMessage } from "@/lib/client-data/lessons";
import { notificationActions, useNotificationPrefs } from "@/lib/client-data/lessonsNotifications";
import {
  CHANNELS,
  REMINDERS,
  isBannerKind,
  timeAgo,
  type LessonNotification,
  type NotificationChannel,
  type NotificationList,
  type NotificationPref,
  type ReminderKind,
} from "@/lib/lessons/notifications";

type Mutate = (next: (previous: NotificationList | null) => NotificationList | null) => void;

/** Marks notifications read on the server and in the list on screen. ids = everything when omitted. */
function useMarkRead(mutate: Mutate) {
  const { showToast } = useToast();
  return async (ids?: number[]) => {
    const when = new Date().toISOString();
    try {
      const { unread } = await notificationActions.markRead(ids);
      mutate((prev) =>
        prev
          ? {
              unread,
              items: prev.items.map((i) => (!i.read_at && (!ids || ids.includes(i.id)) ? { ...i, read_at: when } : i)),
            }
          : prev
      );
    } catch (err) {
      showToast(lessonErrorMessage(err), "error");
    }
  };
}

// ---------------------------------------------------------------------------
// The bell
// ---------------------------------------------------------------------------

export function NotificationsButton({ unread, onClick }: { unread: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border-soft bg-white/[0.03] text-text-muted transition-colors hover:border-white/20 hover:text-white"
    >
      <FaBell aria-hidden="true" />
      {unread > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-accent-red px-1 text-[0.68rem] font-extrabold leading-[18px] text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// The banner: what changed in the student's lessons, until they dismiss it
// ---------------------------------------------------------------------------

export function NotificationBanner({ list, mutate }: { list: NotificationList | null; mutate: Mutate }) {
  const markRead = useMarkRead(mutate);
  const notices = (list?.items ?? []).filter((i) => !i.read_at && isBannerKind(i.kind)).slice(0, 3);
  if (notices.length === 0) return null;

  return (
    <div className="mb-5 flex flex-col gap-2" role="region" aria-label="Changes to your lessons">
      {notices.map((n) => {
        const warning = n.kind === "dst_warning" || n.kind === "class_cancelled";
        const Icon = warning ? FaTriangleExclamation : FaCircleInfo;
        return (
          <div
            key={n.id}
            className={`flex items-start gap-3 rounded-xl border p-3.5 ${
              warning ? "border-accent-orange/40 bg-accent-orange/10" : "border-accent-blue/40 bg-accent-blue/10"
            }`}
          >
            <Icon className={`mt-0.5 shrink-0 ${warning ? "text-accent-orange" : "text-accent-blue"}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[0.9rem] font-extrabold">{n.title}</p>
              <p className="mt-0.5 text-[0.84rem] leading-normal text-text-muted">{n.body}</p>
            </div>
            <button
              type="button"
              onClick={() => void markRead([n.id])}
              className="shrink-0 cursor-pointer rounded-lg px-2.5 py-1 text-[0.8rem] font-bold text-text-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              Got it
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The inbox and the reminder settings
// ---------------------------------------------------------------------------

type Tab = "inbox" | "reminders";

export function NotificationsModal({
  user,
  list,
  nowMs,
  mutate,
  onClose,
}: {
  user: User | null;
  list: NotificationList | null;
  nowMs: number;
  mutate: Mutate;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("inbox");
  const markRead = useMarkRead(mutate);
  const items = list?.items ?? [];

  return (
    <Modal onClose={onClose} labelledBy="notifications-title" showCloseButton>
      <h2 id="notifications-title" className="pr-10 text-xl font-extrabold">
        Notifications
      </h2>
      <div className="mt-3">
        <PillSelector
          variant="tabs"
          active={tab}
          onChange={setTab}
          options={[
            { value: "inbox", label: "Inbox" },
            { value: "reminders", label: "Reminders" },
          ]}
        />
      </div>

      {tab === "inbox" ? (
        <div className="mt-4">
          {items.length === 0 ? (
            <p className="py-8 text-center text-[0.88rem] text-text-muted">Nothing yet. Reminders and changes to your lessons show up here.</p>
          ) : (
            <>
              <ul className="-mx-1 max-h-[50vh] overflow-y-auto px-1">
                {items.map((n) => (
                  <InboxItem key={n.id} notification={n} nowMs={nowMs} onOpen={() => void markRead([n.id])} />
                ))}
              </ul>
              {list && list.unread > 0 ? (
                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant="secondary" onClick={() => void markRead()}>
                    Mark all as read
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <ReminderSettings user={user} />
      )}
    </Modal>
  );
}

function InboxItem({ notification: n, nowMs, onOpen }: { notification: LessonNotification; nowMs: number; onOpen: () => void }) {
  const unread = !n.read_at;
  return (
    <li className="border-b border-border-soft last:border-b-0">
      <button
        type="button"
        onClick={unread ? onOpen : undefined}
        className={`flex w-full gap-3 py-3 text-left ${unread ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-accent-red" : "bg-transparent"}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={`text-[0.88rem] ${unread ? "font-extrabold" : "font-bold text-text-muted"}`}>{n.title}</span>
            <span className="shrink-0 text-[0.72rem] text-text-muted">{timeAgo(Date.parse(n.created_at), nowMs)}</span>
          </span>
          <span className="mt-0.5 block text-[0.82rem] leading-normal text-text-muted">{n.body}</span>
          {unread ? <span className="sr-only">Unread</span> : null}
        </span>
      </button>
    </li>
  );
}

function ReminderSettings({ user }: { user: User | null }) {
  const { showToast } = useToast();
  const { data: prefs, status, mutate, refetch } = useNotificationPrefs(user, true);

  const isOn = (kind: ReminderKind, channel: NotificationChannel) =>
    prefs?.find((p) => p.kind === kind && p.channel === channel)?.enabled ?? true;

  const toggle = async (kind: ReminderKind, channel: NotificationChannel) => {
    const next: NotificationPref = { kind, channel, enabled: !isOn(kind, channel) };
    mutate((prev) => (prev ?? []).map((p) => (p.kind === kind && p.channel === channel ? next : p)));
    try {
      await notificationActions.setPrefs([next]);
    } catch (err) {
      showToast(lessonErrorMessage(err), "error");
      await refetch();
    }
  };

  if (!prefs) {
    return <p className="py-8 text-center text-[0.88rem] text-text-muted">{status === "error" ? "Couldn't load your settings." : "Loading…"}</p>;
  }

  return <ReminderTable isOn={isOn} onToggle={(kind, channel) => void toggle(kind, channel)} />;
}

/** The switches themselves: one row per reminder, one column per channel. */
export function ReminderTable({
  isOn,
  onToggle,
}: {
  isOn: (kind: ReminderKind, channel: NotificationChannel) => boolean;
  onToggle: (kind: ReminderKind, channel: NotificationChannel) => void;
}) {
  return (
    <div className="mt-4">
      <table className="w-full text-[0.86rem]">
        <thead>
          <tr className="text-left text-[0.72rem] font-bold uppercase tracking-[0.5px] text-text-muted">
            <th className="pb-2 font-bold">Remind me</th>
            {CHANNELS.map((c) => (
              <th key={c.channel} className="pb-2 text-center font-bold">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {REMINDERS.map((r) => (
            <tr key={r.kind} className="border-t border-border-soft">
              <td className="py-2.5 pr-2 font-bold">
                {r.label}
                {r.hint ? <span className="block text-[0.74rem] font-normal text-text-muted">{r.hint}</span> : null}
              </td>
              {CHANNELS.map((c) => (
                <td key={c.channel} className="py-2.5 text-center">
                  <Toggle
                    checked={isOn(r.kind, c.channel)}
                    onChange={() => onToggle(r.kind, c.channel)}
                    color="blue"
                    aria-label={`${r.label}, ${c.label}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[0.78rem] leading-normal text-text-muted">
        Cancellations, changes to your lessons and time-change warnings are always sent: they can&rsquo;t be switched off.
      </p>
    </div>
  );
}
