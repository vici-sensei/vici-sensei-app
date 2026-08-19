import { createClient } from "@/lib/supabase/client";
import { ApiError, extractFunctionErrorMessage } from "@/lib/api/client";

export async function createBillingPortalSession(returnUrl?: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke<{ url: string }>("stripe-create-portal-session", {
    body: { return_url: returnUrl },
  });

  if (error) throw new ApiError(500, await extractFunctionErrorMessage(error, "Could not start the checkout flow."));
  if (!data?.url) throw new ApiError(500, "Could not start the checkout flow.");
  return data.url;
}
