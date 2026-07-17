import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { jsonError, requireUser } from '@/lib/api/errors'
import { getStripeClient } from '@/lib/stripe/client'

export async function GET() {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const { data, error } = await supabase
    .from('users')
    .select('email, display_name, avatar_url, is_premium, created_at')
    .eq('id', user.id)
    .single()

  if (error) {
    return jsonError(500, error.message)
  }

  return NextResponse.json(data)
}

const patchSchema = z
  .object({
    display_name: z.string().min(1).max(50).optional(),
    avatar_url: z.string().url().optional(),
  })
  .refine((body) => body.display_name !== undefined || body.avatar_url !== undefined, {
    message: 'At least one of display_name or avatar_url must be provided.',
  })

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request body.')
  }

  const { data, error } = await supabase
    .from('users')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('email, display_name, avatar_url, is_premium, created_at')
    .single()

  if (error) {
    return jsonError(500, error.message)
  }

  return NextResponse.json(data)
}

export async function DELETE() {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (profileError) {
    return jsonError(500, profileError.message)
  }

  if (profile?.stripe_customer_id) {
    try {
      const stripe = getStripeClient()
      const subscriptions = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: 'active',
      })
      await Promise.all(
        subscriptions.data.map((sub) => stripe.subscriptions.cancel(sub.id))
      )
    } catch (err) {
      return jsonError(
        500,
        `Could not cancel the Stripe subscription before deleting the account: ${
          err instanceof Error ? err.message : 'unknown error'
        }. Configure Stripe or cancel the subscription manually before retrying.`
      )
    }
  }

  const admin = createAdminClient()
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    return jsonError(500, deleteError.message)
  }

  return new NextResponse(null, { status: 204 })
}
