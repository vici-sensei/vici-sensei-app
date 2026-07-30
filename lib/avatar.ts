/**
 * Google's OAuth profile photo URLs embed a size suffix (e.g. "=s96-c") that
 * caps resolution at whatever size was requested when the URL was minted —
 * Supabase's handle_new_user() trigger copies it as-is from raw_user_meta_data,
 * so it defaults to Google's small 96px thumbnail. Requesting a larger size
 * from the same URL avoids upscaling that thumbnail into a blurry avatar.
 */
export function avatarSrc(url: string, size: number): string {
  try {
    const { hostname } = new URL(url);
    if (!hostname.endsWith("googleusercontent.com")) return url;
    return `${url.split("=")[0]}=s${size}-c`;
  } catch {
    return url;
  }
}
