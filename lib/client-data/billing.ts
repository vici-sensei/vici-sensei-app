import { FunctionsHttpError } from "@supabase/functions-js";
import { createClient } from "@/lib/supabase/client";
import { ApiError } from "@/lib/api/client";

/** supabase-js only exposes the raw Response on FunctionsHttpError — the JSON `{error: "..."}` body our functions return on failure has to be read from it explicitly. */
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

export async function createBillingPortalSession(returnUrl?: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke<{ url: string }>("stripe-create-portal-session", {
    body: { return_url: returnUrl },
  });

  if (error) throw new ApiError(500, await extractFunctionErrorMessage(error, "Could not start the checkout flow."));
  if (!data?.url) throw new ApiError(500, "Could not start the checkout flow.");
  return data.url;
}
