/** Side length of the small copy uploadAvatar() stores next to every uploaded photo. */
export const AVATAR_THUMB_SIZE = 128;

// Our own uploads are "<userId>/avatar-<timestamp>.<ext>" with the thumbnail beside it as
// "<userId>/avatar-<timestamp>_sm.<ext>" (see uploadAvatar). Older uploads named plain
// "avatar.<ext>" have no thumbnail, so they deliberately don't match and are served as-is.
const OWN_UPLOAD_RE = /(\/storage\/v1\/object\/public\/avatars\/[^/?#]+\/avatar-\d+)(\.[a-z]+)((?:\?[^#]*)?)$/;

/**
 * Picks the smallest variant of an avatar URL that's still sharp at `size` pixels.
 *
 * Google's OAuth profile photo URLs embed a size suffix (e.g. "=s96-c") that
 * caps resolution at whatever size was requested when the URL was minted —
 * Supabase's handle_new_user() trigger copies it as-is from raw_user_meta_data,
 * so it defaults to Google's small 96px thumbnail. Requesting a larger size
 * from the same URL avoids upscaling that thumbnail into a blurry avatar.
 *
 * Our own Storage uploads can't be resized on request (no image transformations on this plan,
 * and next.config.ts runs next/image unoptimized for the static export), so small renders
 * switch to the pre-made thumbnail instead of pulling the full-size file.
 */
export function avatarSrc(url: string, size: number): string {
  try {
    const { hostname } = new URL(url);
    if (hostname.endsWith("googleusercontent.com")) return `${url.split("=")[0]}=s${size}-c`;
    if (size <= AVATAR_THUMB_SIZE && OWN_UPLOAD_RE.test(url)) return url.replace(OWN_UPLOAD_RE, "$1_sm$2$3");
    return url;
  } catch {
    return url;
  }
}
