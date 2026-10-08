// Makes the key pair web push needs (the lesson notifications, docs/LESSON_BOOKING_PLAN.md section 7).
//
//   node scripts/generate-vapid-keys.mjs
//
// It prints two lines. Then, in the Cloudflare project of the Worker:
//   - VAPID_PUBLIC_KEY   the first value (not secret: put it in wrangler.jsonc "vars" or as a secret);
//   - VAPID_PRIVATE_KEY  the second value, as a SECRET: `npx wrangler secret put VAPID_PRIVATE_KEY`
//                        (paste it when asked; never commit it or paste it in a chat);
//   - VAPID_SUBJECT      "mailto:you@your-domain" (who the push services can contact), same way.
// The page asks the Worker for the public key (GET /api/lessons/push/config), so nothing is needed at build time.
//
// Keep the pair: if the private key is replaced, every device has to turn push on again (a subscription
// only works with the key it was made with).
import { webcrypto } from "node:crypto";

const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicRaw = Buffer.from(await webcrypto.subtle.exportKey("raw", pair.publicKey));
const { d } = await webcrypto.subtle.exportKey("jwk", pair.privateKey);

console.log(`VAPID_PUBLIC_KEY=${publicRaw.toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${d}`);
