/** What the writer stores for a student (lessons.notifications) and the switches they have over it. */

export interface LessonNotification {
  id: number;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}

export interface NotificationList {
  unread: number;
  items: LessonNotification[];
}

export type ReminderKind = "reminder_24h" | "reminder_1h" | "reminder_10m";
export type NotificationChannel = "inapp" | "email" | "push";

export interface NotificationPref {
  kind: ReminderKind;
  channel: NotificationChannel;
  enabled: boolean;
}

export const REMINDERS: Array<{ kind: ReminderKind; label: string; hint?: string }> = [
  { kind: "reminder_24h", label: "24 hours before" },
  { kind: "reminder_1h", label: "1 hour before" },
  { kind: "reminder_10m", label: "10 minutes before", hint: "with the meeting link" },
];

export const CHANNELS: Array<{ channel: NotificationChannel; label: string }> = [
  { channel: "inapp", label: "In the app" },
  { channel: "email", label: "Email" },
];

export function isReminder(kind: string): boolean {
  return kind.startsWith("reminder_");
}

/** Notices that sit at the top of the page until they are dismissed: they change what the student has to
 * do or know about a lesson. Reminders and the rest stay in the inbox only. */
const BANNER_KINDS = new Set([
  "dst_warning",
  "class_cancelled",
  "class_moved",
  "teacher_changed",
  "vacation",
  "class_ended",
  "class_replaced",
  "access_ended",
  "access_ending",
  "removed_by_teacher",
  "waitlist_seat",
]);

export function isBannerKind(kind: string): boolean {
  return BANNER_KINDS.has(kind);
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export function timeAgo(createdMs: number, nowMs: number): string {
  const minutes = Math.floor((nowMs - createdMs) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return new Date(createdMs).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
