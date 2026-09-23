"use client";

import { useState } from "react";
import { avatarSrc } from "@/lib/avatar";

/** avatarSrc() plus one fallback step: if the sized variant fails to load (e.g. an uploaded
 *  photo's thumbnail that never got written), retry the original URL before giving up. `src` is
 *  null when there's no avatar or both attempts failed -- render the placeholder icon then. The
 *  error count is tied to the URL it happened on, so a new avatar URL starts fresh. */
export function useAvatarSrc(url: string | null, size: number) {
  const [errors, setErrors] = useState<{ url: string | null; count: number }>({ url, count: 0 });
  const count = errors.url === url ? errors.count : 0;
  const sized = url ? avatarSrc(url, size) : null;

  let src: string | null = null;
  if (url && count === 0) src = sized;
  else if (url && count === 1 && sized !== url) src = url;

  return { src, onError: () => setErrors({ url, count: count + 1 }) };
}
