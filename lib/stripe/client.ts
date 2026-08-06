import Stripe from 'stripe'
import { getServerEnv } from '@/lib/env'

let cached: Stripe | null = null

export function getStripeClient(): Stripe {
  if (cached) return cached

  const secretKey = getServerEnv('STRIPE_SECRET_KEY')
  if (!secretKey) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Add it to .env.local (Stripe Dashboard > Developers > API keys) to use billing features.'
    )
  }

  cached = new Stripe(secretKey)
  return cached
}
