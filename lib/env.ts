import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Reads a server-only env var (secrets, not NEXT_PUBLIC_*). On Cloudflare Workers
 * (wrangler dev/preview and the deployed production Worker), secret_text bindings
 * aren't reliably reflected in process.env under this adapter, so this reads straight
 * off the Cloudflare env when available. Plain `next dev` has no Cloudflare context
 * (initOpenNextCloudflareForDev isn't called from next.config.ts) and falls back to
 * process.env, which Next.js populates from .env.local there.
 */
export function getServerEnv(name: string): string | undefined {
  try {
    const cfEnv = getCloudflareContext().env as Record<string, string | undefined>;
    return cfEnv[name] ?? process.env[name];
  } catch {
    return process.env[name];
  }
}
