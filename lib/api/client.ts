import { FunctionsHttpError } from "@supabase/supabase-js";

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Common `catch (err) { ... }` idiom: unwrap a thrown value's message, falling back for
 * anything that isn't an Error (e.g. a string/object thrown from outside our code). */
export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** supabase-js only exposes the raw Response on FunctionsHttpError — the JSON `{error: "..."}`
 * body our Edge Functions return on failure has to be read from it explicitly. */
export async function extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body && typeof body.error === "string") return body.error;
    } catch {
      // response body wasn't JSON — fall through to the generic message
    }
  }
  return getErrorMessage(error, fallback);
}
