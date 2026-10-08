/**
 * Web Push from a Worker, with nothing but WebCrypto:
 *   - the message is encrypted for one device as RFC 8291 describes (ECDH P-256 + HKDF + AES-128-GCM in a
 *     single RFC 8188 "aes128gcm" record);
 *   - the request is authenticated to the push service with a VAPID JWT (RFC 8292, ES256).
 * The encryption is checked against the RFC 8291 test vector (worker tests in the scratchpad of the
 * session that wrote it, see docs/LESSON_BOOKING_PLAN.md).
 */

const enc = new TextEncoder();

export function b64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A P-256 key as a JWK from the raw uncompressed public point (and, for a private key, `d`). */
function p256Jwk(publicRaw: Uint8Array, d?: string): JsonWebKey {
  if (publicRaw.length !== 65 || publicRaw[0] !== 0x04) throw new Error("not an uncompressed P-256 point");
  return { kty: "EC", crv: "P-256", x: b64urlEncode(publicRaw.slice(1, 33)), y: b64urlEncode(publicRaw.slice(33, 65)), ...(d ? { d } : {}), ext: true };
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** Largest message the push services accept is 4096 bytes after encryption; this keeps the plaintext under it. */
export const MAX_PLAINTEXT_BYTES = 3800;

export interface Device {
  endpoint: string;
  /** The device's public key (65 bytes, base64url) and auth secret (16 bytes, base64url). */
  p256dh: string;
  auth: string;
}

/** The body of the push request: header (salt, record size, our public key) followed by the encrypted record.
 * `salt` and `sender` exist so the RFC's test vector can be reproduced; in use both are random. */
export async function encryptPayload(
  plaintext: Uint8Array,
  device: Pick<Device, "p256dh" | "auth">,
  fixed?: { salt: Uint8Array; senderPrivate: string; senderPublic: string }
): Promise<Uint8Array> {
  if (plaintext.length > MAX_PLAINTEXT_BYTES) throw new Error("push payload too large");
  const uaPublic = b64urlDecode(device.p256dh);
  const authSecret = b64urlDecode(device.auth);
  if (authSecret.length !== 16) throw new Error("bad auth secret");

  const uaKey = await crypto.subtle.importKey("jwk", p256Jwk(uaPublic), { name: "ECDH", namedCurve: "P-256" }, false, []);
  let senderPrivateKey: CryptoKey;
  let asPublic: Uint8Array;
  if (fixed) {
    asPublic = b64urlDecode(fixed.senderPublic);
    senderPrivateKey = await crypto.subtle.importKey("jwk", p256Jwk(asPublic, fixed.senderPrivate), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  } else {
    const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    senderPrivateKey = pair.privateKey;
    asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  }
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));

  // The runtime's option is called `public`; the Workers typings spell it `$public`.
  const ecdhAlgorithm = { name: "ECDH", public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(ecdhAlgorithm, senderPrivateKey, 256));
  // RFC 8291 section 3.4: IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" 0x00 ua_public as_public, 32)
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  // RFC 8188: the content encryption key and nonce come from HKDF over the record salt
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  // One record: the message, then 0x02 (the last-record padding delimiter).
  const record = concat(plaintext, new Uint8Array([0x02]));
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, record));

  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

// ---------------------------------------------------------------------------
// VAPID
// ---------------------------------------------------------------------------

export interface Vapid {
  /** The application server key: the public point, base64url (what the browser subscribes with). */
  publicKey: string;
  /** The private scalar `d`, base64url. */
  privateKey: string;
  /** "mailto:..." or an https URL the push service can reach the operator at. */
  subject: string;
}

/** A key pair in the form the Worker secrets and the browser need. Run through scripts/generate-vapid-keys.mjs. */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as unknown as JsonWebKey;
  const publicRaw = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  return { publicKey: b64urlEncode(publicRaw), privateKey: jwk.d as string };
}

/** The `Authorization` header for one request to `endpoint`: "vapid t=<jwt>, k=<public key>" (RFC 8292). */
export async function vapidAuthorization(endpoint: string, vapid: Vapid, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud: audience, exp: nowSeconds + 12 * 3600, sub: vapid.subject })));
  const key = await crypto.subtle.importKey(
    "jwk",
    p256Jwk(b64urlDecode(vapid.publicKey), vapid.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  // WebCrypto returns r || s, which is exactly what a JWS ES256 signature is.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64urlEncode(signature)}, k=${vapid.publicKey}`;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/** Push services the Worker is willing to call. The endpoint comes from the browser, so it must never be
 * a way to make the Worker request an arbitrary address: only these hosts (Chrome/Edge/Opera, Firefox,
 * Safari, Windows) are accepted, and only over https. */
const PUSH_HOST_SUFFIXES = [".googleapis.com", ".push.services.mozilla.com", ".push.apple.com", ".notify.windows.com"];
const PUSH_HOSTS = new Set(["push.services.mozilla.com", "web.push.apple.com"]);

export function isPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.has(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** What happened to one device:
 *  ok: the push service accepted it; gone: the device is unsubscribed (404 / 410): forget it;
 *  retry: a temporary problem (429, 5xx, network): try later; failed: refused for good (bad request, bad
 *  VAPID key...), not worth retrying. */
export type PushOutcome = { kind: "ok" | "gone" | "retry" | "failed"; status?: number; error?: string };

export async function sendWebPush(
  device: Device,
  message: unknown,
  vapid: Vapid,
  opts: { ttlSeconds?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string } = {}
): Promise<PushOutcome> {
  if (!isPushEndpoint(device.endpoint)) return { kind: "gone", error: "not a push service address" };
  try {
    const body = await encryptPayload(enc.encode(JSON.stringify(message)), device);
    const res = await fetch(device.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidAuthorization(device.endpoint, vapid),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(opts.ttlSeconds ?? 3600),
        Urgency: opts.urgency ?? "normal",
        ...(opts.topic ? { Topic: opts.topic } : {}),
      },
      body,
    });
    if (res.status === 201 || res.status === 200 || res.status === 202) return { kind: "ok", status: res.status };
    if (res.status === 404 || res.status === 410) return { kind: "gone", status: res.status };
    if (res.status === 429 || res.status >= 500) return { kind: "retry", status: res.status, error: `push service answered ${res.status}` };
    return { kind: "failed", status: res.status, error: `push service answered ${res.status}` };
  } catch (err) {
    return { kind: "retry", error: err instanceof Error ? err.message : String(err) };
  }
}
