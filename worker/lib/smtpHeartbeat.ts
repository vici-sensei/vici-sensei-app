import { connect } from "cloudflare:sockets";
import type { Env } from "./env";

/**
 * Monthly "SMTP heartbeat" (docs/PASSWORD_AUTH_PLAN.md). The Brevo SMTP key Supabase uses to send the
 * sign-up / reset / change-email emails expires after 90 consecutive days with no use. A quiet app
 * can easily go that long without a single email, and the first sign-up afterwards would then fail
 * with a generic "error sending confirmation email". Once a month this sends one short email through
 * the SAME SMTP relay with the SAME key, which counts as a use. It needs a second copy of the key as a
 * Worker secret (`wrangler secret put SMTP_PASSWORD`), typed by the owner, never pasted in chat.
 *
 * A deliberately tiny SMTP client (EHLO, STARTTLS, AUTH PLAIN, one message) instead of a dependency:
 * it only ever talks to one provider, with one fixed message.
 */

const DEFAULT_HOST = "smtp-relay.brevo.com";
const DEFAULT_PORT = 587;
const DEFAULT_FROM = "no-reply@vici-sensei.com";
const OVERALL_TIMEOUT_MS = 30_000;

interface MailConfig {
  host: string;
  port: number;
  /** Upgrade the plain connection with STARTTLS (what port 587 needs). Only `false` for a local test server. */
  startTls: boolean;
  user: string;
  password: string;
  from: string;
  to: string;
  subject: string;
  body: string;
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
    if (!codes.includes(code)) throw new Error(`${what}: server answered "${last.slice(0, 120)}"`);
  }
}

async function sendMail(config: MailConfig): Promise<void> {
  const socket = connect(
    { hostname: config.host, port: config.port },
    { secureTransport: config.startTls ? "starttls" : "off", allowHalfOpen: false }
  );

  const run = async () => {
    let conn = new Connection(socket.readable.getReader(), socket.writable.getWriter());
    await conn.expect([220], "greeting");
    await conn.send("EHLO vici-sensei.com");
    await conn.expect([250], "EHLO");

    if (config.startTls) {
      await conn.send("STARTTLS");
      await conn.expect([220], "STARTTLS");
      conn.release();
      const secure = socket.startTls();
      conn = new Connection(secure.readable.getReader(), secure.writable.getWriter());
      // After the upgrade the session starts over: capabilities must be asked for again.
      await conn.send("EHLO vici-sensei.com");
      await conn.expect([250], "EHLO after STARTTLS");
    }

    await conn.send(`AUTH PLAIN ${btoa(`\0${config.user}\0${config.password}`)}`);
    await conn.expect([235], "authentication");
    await conn.send(`MAIL FROM:<${config.from}>`);
    await conn.expect([250], "MAIL FROM");
    await conn.send(`RCPT TO:<${config.to}>`);
    await conn.expect([250, 251], "RCPT TO");
    await conn.send("DATA");
    await conn.expect([354], "DATA");

    const headers = [
      `From: Vici Sensei <${config.from}>`,
      `To: <${config.to}>`,
      `Subject: ${config.subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@vici-sensei.com>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
    ];
    // A body line that starts with "." would end the message early (dot-stuffing, RFC 5321 4.5.2).
    const body = config.body
      .split(/\r?\n/)
      .map((line) => (line.startsWith(".") ? `.${line}` : line))
      .join("\r\n");
    await conn.send(`${headers.join("\r\n")}\r\n\r\n${body}\r\n.`);
    await conn.expect([250], "message accepted");
    await conn.send("QUIT");
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${OVERALL_TIMEOUT_MS / 1000}s`)), OVERALL_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    await socket.close().catch(() => undefined);
  }
}

async function log(env: Env, status: string, detail: unknown): Promise<void> {
  await env.ACCOUNTS_DB.prepare("INSERT INTO reconciliation_log (status, detail) VALUES (?1, ?2)")
    .bind(status, JSON.stringify(detail))
    .run();
}

/** Runs from the monthly cron. Logs every outcome to `reconciliation_log`, success included: this
 * runs once a month, so a row per run is a handful of rows a year, and "it ran and it worked" is
 * exactly what has to be checkable. */
export async function runSmtpHeartbeat(env: Env): Promise<void> {
  if (!env.SMTP_USER || !env.SMTP_PASSWORD || !env.HEARTBEAT_EMAIL_TO) {
    await log(env, "smtp_heartbeat_skipped", { reason: "SMTP_USER / SMTP_PASSWORD / HEARTBEAT_EMAIL_TO not all set" });
    return;
  }

  const config: MailConfig = {
    host: env.SMTP_HOST || DEFAULT_HOST,
    port: Number(env.SMTP_PORT) || DEFAULT_PORT,
    startTls: env.SMTP_STARTTLS !== "false",
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: DEFAULT_FROM,
    to: env.HEARTBEAT_EMAIL_TO,
    subject: "Vici Sensei: monthly email check",
    body: [
      "This is the monthly check that keeps the Brevo SMTP key from expiring",
      "(it expires after 90 days without use).",
      "",
      "Nothing to do. If you stop getting this email, sign-up and password-reset",
      "emails may stop too: create a new SMTP key in Brevo and update it in both",
      "Supabase projects and in the Worker secret SMTP_PASSWORD.",
    ].join("\n"),
  };

  try {
    await sendMail(config);
    await log(env, "smtp_heartbeat", { ok: true, host: config.host });
  } catch (err) {
    // Server replies never contain the credentials, so the message is safe to store.
    await log(env, "smtp_heartbeat_error", { error: err instanceof Error ? err.message : String(err), host: config.host });
  }
}
