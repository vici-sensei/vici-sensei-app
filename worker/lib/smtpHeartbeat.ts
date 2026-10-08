import type { Env } from "./env";
import { DEFAULT_FROM, sendMails, smtpSettings } from "./mailer";

/**
 * Monthly "SMTP heartbeat" (docs/PASSWORD_AUTH_PLAN.md). The Brevo SMTP key Supabase uses to send the
 * sign-up / reset / change-email emails expires after 90 consecutive days with no use. A quiet app
 * can easily go that long without a single email, and the first sign-up afterwards would then fail
 * with a generic "error sending confirmation email". Once a month this sends one short email through
 * the SAME SMTP relay with the SAME key, which counts as a use. It needs a second copy of the key as a
 * Worker secret (`wrangler secret put SMTP_PASSWORD`), typed by the owner, never pasted in chat.
 *
 * The SMTP client itself is in mailer.ts (the lesson notification emails use it too; they use the
 * relay every few minutes, so once lessons are live this heartbeat is belt and braces).
 */

async function log(env: Env, status: string, detail: unknown): Promise<void> {
  await env.ACCOUNTS_DB.prepare("INSERT INTO reconciliation_log (status, detail) VALUES (?1, ?2)")
    .bind(status, JSON.stringify(detail))
    .run();
}

/** Runs from the monthly cron. Logs every outcome to `reconciliation_log`, success included: this
 * runs once a month, so a row per run is a handful of rows a year, and "it ran and it worked" is
 * exactly what has to be checkable. */
export async function runSmtpHeartbeat(env: Env): Promise<void> {
  const settings = smtpSettings(env);
  if (!settings || !env.HEARTBEAT_EMAIL_TO) {
    await log(env, "smtp_heartbeat_skipped", { reason: "SMTP_USER / SMTP_PASSWORD / HEARTBEAT_EMAIL_TO not all set" });
    return;
  }

  const [outcome] = await sendMails(settings, [
    {
      from: DEFAULT_FROM,
      to: env.HEARTBEAT_EMAIL_TO,
      subject: "Vici Sensei: monthly email check",
      text: [
        "This is the monthly check that keeps the Brevo SMTP key from expiring",
        "(it expires after 90 days without use).",
        "",
        "Nothing to do. If you stop getting this email, sign-up and password-reset",
        "emails may stop too: create a new SMTP key in Brevo and update it in both",
        "Supabase projects and in the Worker secret SMTP_PASSWORD.",
      ].join("\n"),
    },
  ]);

  if (outcome.ok) {
    await log(env, "smtp_heartbeat", { ok: true, host: settings.host });
  } else {
    // Server replies never contain the credentials, so the message is safe to store.
    await log(env, "smtp_heartbeat_error", { error: outcome.error, host: settings.host });
  }
}
