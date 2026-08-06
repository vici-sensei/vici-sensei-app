import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripeClient } from '@/lib/stripe/client'
import { jsonError } from '@/lib/api/errors'
import { getServerEnv } from '@/lib/env'

export async function POST(request: Request) {
  const webhookSecret = getServerEnv('STRIPE_WEBHOOK_SECRET')
  if (!webhookSecret) {
    return jsonError(500, 'STRIPE_WEBHOOK_SECRET is not set. Add it to .env.local before enabling the webhook.')
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return jsonError(400, 'Missing stripe-signature header.')
  }

  const body = await request.text()

  let event: Stripe.Event
  try {
    const stripe = getStripeClient()
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    return jsonError(400, `Invalid Stripe signature: ${err instanceof Error ? err.message : 'unknown error'}`)
  }

  const admin = createAdminClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.client_reference_id
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
      if (userId && customerId) {
        await admin.from('users').update({ is_premium: true, stripe_customer_id: customerId }).eq('id', userId)
      }
      break
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
      await admin.from('users').update({ is_premium: false }).eq('stripe_customer_id', customerId)
      break
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
      if (customerId) {
        await admin.from('users').update({ is_premium: false }).eq('stripe_customer_id', customerId)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
