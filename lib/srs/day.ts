/** UTC offset (ms) of `timezone` at the instant `date` — accounts for DST, since it's derived from Intl for that specific instant rather than a fixed number. */
function timezoneOffsetMs(timezone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date)

  const get = (type: string) => parts.find((p) => p.type === type)!.value
  const asUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")),
    Number(get("minute")),
    Number(get("second"))
  )
  return asUtc - date.getTime()
}

/**
 * Calendar-day boundaries for "introduced today" counts (::date casts aren't expressible
 * through PostgREST filters), expressed as UTC instants.
 *
 * Without a `timezone`, the day is the UTC calendar day — daily quotas then reset at UTC
 * midnight, which can be hours off from the user's actual local midnight. Pass the IANA
 * timezone name (`Intl.DateTimeFormat().resolvedOptions().timeZone` in the browser) to
 * reset at the user's local midnight instead.
 */
export function utcDayBounds(reference: Date = new Date(), timezone?: string) {
  if (!timezone) {
    const start = new Date(
      Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate())
    )
    const end = new Date(start.getTime() + 86_400_000)
    return { start: start.toISOString(), end: end.toISOString() }
  }

  const localDateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(reference)
  const get = (type: string) => Number(localDateParts.find((p) => p.type === type)!.value)

  // Midnight in `timezone`, expressed as a UTC instant: guess UTC midnight for that
  // Y-M-D, then shift by the zone's actual offset at that instant.
  const utcGuess = Date.UTC(get("year"), get("month") - 1, get("day"))
  const offsetMs = timezoneOffsetMs(timezone, new Date(utcGuess))
  const start = new Date(utcGuess - offsetMs)
  const end = new Date(start.getTime() + 86_400_000)
  return { start: start.toISOString(), end: end.toISOString() }
}
