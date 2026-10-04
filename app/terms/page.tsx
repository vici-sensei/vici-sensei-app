import type { Metadata } from "next";
import { LegalPage, LEGAL_CONTACT } from "@/app/components/auth/LegalPage";

export const metadata: Metadata = { title: "Terms of Use — Vici Sensei" };

// DRAFT wording: a starting point written from what the app actually does, not legal advice.
// Review it (and fill in LEGAL_CONTACT) before relying on it.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="October 2026">
      <p>
        These terms apply when you create an account and use Vici Sensei, a spaced-repetition app for learning
        Japanese. By creating an account you agree to them.
      </p>
      <h2>Your account</h2>
      <ul>
        <li>You can sign up with Google or with an email address and a password.</li>
        <li>Keep your password to yourself. You are responsible for what happens under your account.</li>
        <li>Give us a real email address you can read: we use it to confirm your account and to reset your password.</li>
      </ul>
      <h2>Using the app</h2>
      <ul>
        <li>Use Vici Sensei for your own learning. Don&apos;t try to break it, overload it, or access other people&apos;s data.</li>
        <li>
          Your name, photo and country can appear on the public leaderboards. You can hide your country in your
          profile settings.
        </li>
        <li>Pro access comes with enrolment in the courses; it can also be given as a time-limited trial.</li>
      </ul>
      <h2>Ending your account</h2>
      <p>
        You can delete your account from Settings at any time; it is scheduled for deletion and removed after a
        short grace period. We may suspend accounts that abuse the service.
      </p>
      <h2>Changes and contact</h2>
      <p>
        We may update these terms; the date above shows when they last changed. Questions: {LEGAL_CONTACT}.
      </p>
    </LegalPage>
  );
}
