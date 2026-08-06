import { FunctionsHttpError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { ApiError } from "@/lib/api/client";

async function extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body && typeof body.error === "string") return body.error;
    } catch {
      // response body wasn't JSON — fall through to the generic message
    }
  }
  return error instanceof Error ? error.message : fallback;
}

export async function deleteAccount(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.functions.invoke("delete-account");
  if (error) {
    throw new ApiError(500, await extractFunctionErrorMessage(error, "Could not delete your account. Please try again."));
  }
}
