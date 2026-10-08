import { connect } from "cloudflare:sockets";
import type { Env } from "./env";

/**
 * A deliberately tiny SMTP client (EHLO, STARTTLS, AUTH PLAIN, then any number of messages in one
 * session) instead of a dependency: the Worker only ever talks to one provider (Brevo's relay, the same
 * one Supabase Auth uses), with plain-text messages. Used by the monthly heartbeat (smtpHeartbeat.ts) and
 * by the lesson notification emails (lessonsNotify.ts).
 *
 * Every message is sent as UTF-8 text, base64-encoded, so a class title in Japanese or an accent in a
 * name goes through untouched; the subject is RFC 2047-encoded when it is not plain ASCII.
 */

const DEFAULT_HOST = "smtp-relay.brevo.com";
const DEFAULT_PORT = 587;
export const DEFAULT_FROM = "no-reply@vici-sensei.com";
const BASE_TIMEOUT_MS = 30_000;
const PER_MESSAGE_TIMEOUT_MS = 3_000;

export interface SmtpSettings {
  host: string;
  port: number;
  /** Upgrade the plain connection with STARTTLS (what port 587 needs). Only `false` for a local test server. */
  startTls: boolean;
  user: string;
  password: string;
}

export interface OutgoingMail {
  from: string;
  to: string;
  subject: string;
  text: string;
  /** Machine-generated mail (notifications): tells auto-responders not to answer. */
  automatic?: boolean;
}

/** What happened to one message.
 *  - permanent: the server refused this message for good (a bad address, a 5xx): do not retry;
 *  - retry: a temporary refusal or a broken connection while this message was being sent: try again later;
 *  - release: it never got a chance (could not connect or log in, or an earlier message broke the
 *    session): not the message's fault, so it does not count as an attempt. */
export type MailOutcome = { ok: true } | { ok: false; kind: "permanent" | "retry" | "release"; error: string };

/** The SMTP login from the Worker's secrets; null while SMTP_USER / SMTP_PASSWORD are not both set.
 * SMTP_HOST / SMTP_PORT / SMTP_STARTTLS only exist so a local test server can stand in for Brevo. */
export function smtpSettings(env: Env): SmtpSettings | null {
  if (!env.SMTP_USER || !env.SMTP_PASSWORD) return null;
  return {
    host: env.SMTP_HOST || DEFAULT_HOST,
    port: Number(env.SMTP_PORT) || DEFAULT_PORT,
    startTls: env.SMTP_STARTTLS !== "false",
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
  };
}

class SmtpError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message);
  }
}

class Connection {
  private buffer = "";
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();

  constructor(
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    private readonly writer: WritableStreamDefaultWriter<Uint8Array>
  ) {}

  async send(line: string): Promise<void> {
    await this.writer.write(this.encoder.encode(`${line}\r\n`));
  }

  /** Releases the stream locks so the underlying socket can be upgraded with startTls(). */
  release(): void {
    this.reader.releaseLock();
    this.writer.releaseLock();
  }

  private async readLine(): Promise<string> {
    for (;;) {
      const end = this.buffer.indexOf("\r\n");
      if (end >= 0) {
        const line = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 2);
        return line;
      }
      const { value, done } = await this.reader.read();
      if (done) throw new Error("connection closed by the server");
      this.buffer += this.decoder.decode(value, { stream: true });
    }
  }

  /** One SMTP reply, which may span several lines ("250-..." continues, "250 ..." ends it). */
  async reply(): Promise<{ code: number; last: string }> {
    for (;;) {
      const line = await this.readLine();
      if (/^\d{3}( |$)/.test(line)) return { code: Number(line.slice(0, 3)), last: line };
      if (!/^\d{3}-/.test(line)) throw new Error(`malformed SMTP reply: ${line.slice(0, 80)}`);
    }
  }

  async expect(codes: number[], what: string): Promise<void> {
    const { code, last } = await this.reply();
    if (!codes.includes(code)) throw new SmtpError(code, `${what}: server answered "${last.slice(0, 120)}"`);
  }
}

// ---------------------------------------------------------------------------
// Message encoding
// ---------------------------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Header text with line breaks removed (a subject must never be able to add a header). */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 "encoded words" for a header that is not plain ASCII; each word is at most ~45 bytes of text
 * so the line stays under the 76-column limit, and never splits a character. */
export function encodeHeader(value: string): string {
  const text = oneLine(value);
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  const encoder = new TextEncoder();
  const words: string[] = [];
  let chunk = "";
  for (const ch of text) {
    if (encoder.encode(chunk + ch).length > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${toBase64(encoder.encode(w))}?=`).join("\r\n ");
}

const ADDRESS_RE = /^[^\s<>@,;:"()[\]\\]+@[^\s<>@,;:"()[\]\\]+\.[^\s<>@,;:"()[\]\\]+$/;

export function isMailAddress(value: string): boolean {
  return value.length <= 254 && ADDRESS_RE.test(value);
}

/** The text of one message as it goes over the wire (headers, blank line, body, no terminator). */
export function buildMessage(mail: OutgoingMail): string {
  const body = toBase64(new TextEncoder().encode(mail.text.replace(/\r?\n/g, "\r\n")))
    .replace(/(.{76})/g, "$1\r\n")
    .replace(/\r\n$/, "");
  const headers = [
    `From: Vici Sensei <${mail.from}>`,
    `To: <${mail.to}>`,
    `Subject: ${encodeHeader(mail.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@vici-sensei.com>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    ...(mail.automatic ? ["Auto-Submitted: auto-generated"] : []),
  ];
  // base64 never starts a line with "." so no dot-stuffing (RFC 5321 4.5.2) is needed for the body.
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/** The server answered one message with an error code: 5xx is final, 4xx is worth another try. */
function refused(err: SmtpError): MailOutcome {
  return { ok: false, kind: err.code >= 500 ? "permanent" : "retry", error: err.message };
}

/** Sends the messages in ONE SMTP session and says what happened to each, in the same order. Never
 * throws: a connection or login problem is reported as "release" for every message. */
export async function sendMails(settings: SmtpSettings, mails: OutgoingMail[]): Promise<MailOutcome[]> {
  const outcomes: Array<MailOutcome | null> = mails.map(() => null);
  const timeoutMs = BASE_TIMEOUT_MS + PER_MESSAGE_TIMEOUT_MS * mails.length;

  mails.forEach((mail, i) => {
    if (!isMailAddress(mail.to) || !isMailAddress(mail.from)) outcomes[i] = { ok: false, kind: "permanent", error: "invalid email address" };
  });
  if (outcomes.every((o) => o !== null)) return outcomes as MailOutcome[];

  let socket: ReturnType<typeof connect> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Read by the catch below after the closure has run, so it is an object (not narrowed like a plain let).
  const state = { phase: "setup" as "setup" | "send", current: -1 };

  const run = async () => {
    socket = connect({ hostname: settings.host, port: settings.port }, { secureTransport: settings.startTls ? "starttls" : "off", allowHalfOpen: false });
    let conn = new Connection(socket.readable.getReader(), socket.writable.getWriter());
    await conn.expect([220], "greeting");
    await conn.send("EHLO vici-sensei.com");
    await conn.expect([250], "EHLO");

    if (settings.startTls) {
      await conn.send("STARTTLS");
      await conn.expect([220], "STARTTLS");
      conn.release();
      const secure = socket.startTls();
      conn = new Connection(secure.readable.getReader(), secure.writable.getWriter());
      // After the upgrade the session starts over: capabilities must be asked for again.
      await conn.send("EHLO vici-sensei.com");
      await conn.expect([250], "EHLO after STARTTLS");
    }

    await conn.send(`AUTH PLAIN ${btoa(`\0${settings.user}\0${settings.password}`)}`);
    await conn.expect([235], "authentication");
    state.phase = "send";

    for (let i = 0; i < mails.length; i += 1) {
      if (outcomes[i] !== null) continue;
      state.current = i;
      const mail = mails[i];
      try {
        await conn.send(`MAIL FROM:<${mail.from}>`);
        await conn.expect([250], "MAIL FROM");
        await conn.send(`RCPT TO:<${mail.to}>`);
        await conn.expect([250, 251], "RCPT TO");
        await conn.send("DATA");
        await conn.expect([354], "DATA");
        await conn.send(`${buildMessage(mail)}\r\n.`);
        await conn.expect([250], "message accepted");
        outcomes[i] = { ok: true };
      } catch (err) {
        if (!(err instanceof SmtpError)) throw err; // the connection is broken: stop, the rest is released
        outcomes[i] = refused(err);
        await conn.send("RSET");
        await conn.expect([250], "RSET");
      }
      state.current = -1;
    }
    await conn.send("QUIT");
  };

  try {
    await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs / 1000}s`)), timeoutMs);
      }),
    ]);
  } catch (err) {
    // Setup problems (cannot connect, wrong login) are not the messages' fault. Mid-message, the one that was
    // being sent may or may not have gone out: it is tried again, the rest simply never started.
    const error = err instanceof Error ? err.message : String(err);
    if (state.phase === "send" && state.current >= 0 && outcomes[state.current] === null) outcomes[state.current] = { ok: false, kind: "retry", error };
    for (let i = 0; i < outcomes.length; i += 1) {
      if (outcomes[i] === null) outcomes[i] = { ok: false, kind: "release", error };
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    await (socket as ReturnType<typeof connect> | null)?.close().catch(() => undefined);
  }
  return outcomes as MailOutcome[];
}
