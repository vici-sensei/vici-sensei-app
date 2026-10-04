import type { Metadata } from "next";
import { LegalPage, LEGAL_CONTACT } from "@/app/components/auth/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy — Vici Sensei" };

// DRAFT wording: a starting point written from what the app actually stores and which services it
// uses, not legal advice. Review it (and fill in LEGAL_CONTACT) before relying on it.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 2026">
      <p>This explains what Vici Sensei stores about you and why.</p>
      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Account:</strong> your email address and, if you sign up with a password, a salted hash of it (we
          never see or store the password itself). If you sign in with Google, your Google name and profile photo.
        </li>
        <li>
          <strong>Profile:</strong> the display name, photo and country you choose, and your leaderboard preferences.
        </li>
        <li>
          <strong>Learning data:</strong> your study settings, reviews, streaks and progress.
        </li>
        <li>
          <strong>Technical logs:</strong> error reports from the app, used to fix bugs.
        </li>
      </ul>
      <h2>Who processes it</h2>
      <ul>
        <li>Supabase hosts the database and sign-in. Your data lives in either the EU or the US region, depending on where you are.</li>
        <li>Cloudflare hosts the website and runs the bot check on the sign-up and login forms.</li>
        <li>Brevo sends the confirmation and password-reset emails.</li>
        <li>Google provides &quot;Continue with Google&quot; if you choose it.</li>
      </ul>
      <h2>What is public</h2>
      <p>
        On the leaderboards other students can see your display name, photo and (unless you hide it) country,
        together with your scores.
      </p>
      <h2>Your choices</h2>
      <ul>
        <li>Change or remove your name, photo and country in Settings.</li>
        <li>Delete your account in Settings. Your data is removed after a short grace period.</li>
        <li>To ask for a copy of your data or anything else about it, write to {LEGAL_CONTACT}.</li>
      </ul>
    </LegalPage>
  );
}
