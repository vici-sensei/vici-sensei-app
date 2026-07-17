/** UTC day boundaries for "introduced today" counts (::date casts aren't expressible through PostgREST filters). */
export function utcDayBounds(reference: Date = new Date()) {
  const start = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate())
  )
  const end = new Date(start.getTime() + 86_400_000)
  return { start: start.toISOString(), end: end.toISOString() }
}
