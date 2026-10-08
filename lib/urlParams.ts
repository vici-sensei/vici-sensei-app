/** One value out of a query-string param: `value` if it is one of `allowed`, else `fallback`. */
export function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** The values of a comma-separated query-string param that are in `allowed`, in `allowed`'s order. */
export function manyOf<T extends string>(value: string | null, allowed: readonly T[]): T[] {
  if (!value) return [];
  return allowed.filter((option) => value.split(",").includes(option));
}
