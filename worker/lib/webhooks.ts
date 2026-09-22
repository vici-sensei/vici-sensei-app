/**
 * Verifies a Supabase Auth Hook request per the Standard Webhooks spec
 * (https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md),
 * which is what Supabase's HTTP Auth Hooks use. Hand-rolled with Web Crypto instead of the
 * `standardwebhooks` npm package so there's no question of Workers-runtime compatibility.
 *
 * Signed string: `${webhook-id}.${webhook-timestamp}.${rawBody}`, HMAC-SHA256 keyed by the
 * base64 portion of the secret (after stripping its `v1,whsec_` prefix). `webhook-signature` is
 * a space-separated list of `v1,<base64 signature>` values (for secret rotation) -- a match on
 * any one of them is a pass.
 */

const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

export interface WebhookVerificationResult {
  ok: boolean;
  reason?: string;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function hmacSha256Base64(secretBytes: Uint8Array, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToBase64(signature);
}

/** `secret` is the whole Dashboard-generated value, e.g. `v1,whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`. */
export async function verifyStandardWebhook(
  secret: string,
  rawBody: string,
  headers: Headers
): Promise<WebhookVerificationResult> {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");
  if (!id || !timestamp || !signatureHeader) {
    return { ok: false, reason: "missing_headers" };
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, reason: "invalid_timestamp" };
  }
  const skew = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (skew > MAX_TIMESTAMP_SKEW_SECONDS) {
    return { ok: false, reason: "timestamp_out_of_range" };
  }

  const base64Secret = secret.replace(/^v1,whsec_/, "");
  const expected = await hmacSha256Base64(base64ToBytes(base64Secret), `${id}.${timestamp}.${rawBody}`);

  const candidates = signatureHeader.split(" ").map((part) => part.split(",")[1]).filter(Boolean);
  const matched = candidates.some((candidate) => timingSafeEqual(candidate, expected));
  return matched ? { ok: true } : { ok: false, reason: "signature_mismatch" };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
