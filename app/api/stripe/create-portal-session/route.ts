import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { getStripeClient } from '@/lib/stripe/client'

const bodySchema = z.object({ return_url: z.string().url().optional() })

export async function POST(request: Request) {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request body.')
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (profileError) return jsonError(500, profileError.message)
  if (!profile.stripe_customer_id) {
    return jsonError(400, 'This account has no Stripe billing profile yet.')
  }

  const origin = new URL(request.url).origin
  const returnUrl = parsed.data.return_url ?? `${origin}/dashboard`

  try {
    const stripe = getStripeClient()
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl,
    })
    return NextResponse.json({ url: session.url })
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : 'Stripe portal session creation failed.')
  }
}
