import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { getStripeClient } from '@/lib/stripe/client'

const bodySchema = z.object({
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
})

export async function POST(request: Request) {
  const priceId = process.env.STRIPE_PRICE_ID
  if (!priceId) {
    return jsonError(500, 'STRIPE_PRICE_ID is not set. Add it to .env.local before starting checkout.')
  }

  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request body.')
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('stripe_customer_id, email')
    .eq('id', user.id)
    .single()

  if (profileError) return jsonError(500, profileError.message)

  const origin = new URL(request.url).origin
  const successUrl = parsed.data.success_url ?? `${origin}/dashboard?checkout=success`
  const cancelUrl = parsed.data.cancel_url ?? `${origin}/dashboard?checkout=cancel`

  try {
    const stripe = getStripeClient()

    let customerId = profile.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({ email: profile.email })
      customerId = customer.id
      const { error: updateError } = await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
      if (updateError) return jsonError(500, updateError.message)
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : 'Stripe checkout session creation failed.')
  }
}
