import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { jsonError, requireUser } from '@/lib/api/errors'
import { getStripeClient } from '@/lib/stripe/client'
import { fetchUserProfile } from '@/lib/data/userProfile'

export async function GET() {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  try {
    const data = await fetchUserProfile(supabase, user.id)
    return NextResponse.json(data)
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : 'Failed to load user profile.')
  }
}

const patchSchema = z.object({
  display_name: z.string().min(1).max(50),
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

export async function DELETE(request: Request) {
  const requestOrigin = request.headers.get('origin')
  const expectedOrigin = new URL(request.url).origin
  if (requestOrigin && requestOrigin !== expectedOrigin) {
    return jsonError(403, 'Cross-origin requests are not allowed for this action.')
  }

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

  let hadActiveSubscription = false
  let stripeCustomerDeleted = false

  if (profile?.stripe_customer_id) {
    try {
      const stripe = getStripeClient()
      const subscriptions = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: 'all',
      })
      // Only 'canceled' and 'incomplete_expired' are already-terminal states;
      // everything else (active, trialing, past_due, unpaid, paused,
      // incomplete) still needs to be canceled, or Stripe will refuse to
      // delete a customer that has subscriptions attached.
      const cancelableSubscriptions = subscriptions.data.filter(
        (sub) => sub.status !== 'canceled' && sub.status !== 'incomplete_expired'
      )
      hadActiveSubscription = cancelableSubscriptions.length > 0
      await Promise.all(
        cancelableSubscriptions.map((sub) => stripe.subscriptions.cancel(sub.id))
      )
      await stripe.customers.del(profile.stripe_customer_id)
      stripeCustomerDeleted = true
    } catch (err) {
      return jsonError(
        500,
        `Could not cancel the Stripe subscription or remove the Stripe customer before deleting the account: ${
          err instanceof Error ? err.message : 'unknown error'
        }. Configure Stripe or resolve this manually before retrying.`
      )
    }
  }

  const admin = createAdminClient()
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    return jsonError(500, deleteError.message)
  }

  const { error: auditError } = await admin.from('account_deletion_log').insert({
    user_id: user.id,
    had_active_subscription: hadActiveSubscription,
    stripe_customer_deleted: stripeCustomerDeleted,
  })
  if (auditError) {
    console.error('Failed to write account_deletion_log entry:', auditError.message)
  }

  return new NextResponse(null, { status: 204 })
}
