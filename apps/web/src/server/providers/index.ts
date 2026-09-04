import "server-only";

import { createProviderRegistry, type ProviderRegistry } from "./registry";
import { XenditAdapter, type XenditAdapterDeps } from "./xendit";
import { StripeAdapter, type StripeAdapterDeps } from "./stripe";

/**
 * Server-only provider registry factory. In a full wiring, the deps resolve
 * secrets via provider-secrets and construct the real SDK clients (lib/xendit.ts /
 * lib/stripe.ts). Tests inject in-memory deps. No provider SDK is imported here.
 */
export function buildProviderRegistry(deps: {
  xendit: XenditAdapterDeps;
  stripe: StripeAdapterDeps;
}): ProviderRegistry {
  const registry = createProviderRegistry();
  registry.register(new XenditAdapter(deps.xendit));
  registry.register(new StripeAdapter(deps.stripe));
  return registry;
}
