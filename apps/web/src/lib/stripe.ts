import "server-only";

import Stripe from "stripe";
import { env } from "@/lib/env";

// Server-only Stripe SDK boundary (ADR-0028). This is the single `stripe`
// import; feature code consumes the injected adapter surface, never the SDK.
// The API version is pinned to the reviewed version carried by this SDK.

export const STRIPE_API_VERSION = "2026-08-26.dahlia" as const;

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    timeout: 30_000,
    maxNetworkRetries: 0, // financial writes must not be blindly retried
  });
}

export function getConfiguredStripeClient(): Stripe | null {
  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }
  return createStripeClient(secretKey);
}

export function isStripeConfigured(): boolean {
  return !!env.STRIPE_SECRET_KEY;
}
