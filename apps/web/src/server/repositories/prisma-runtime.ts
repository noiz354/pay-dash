import "server-only";

/**
 * Lazy Prisma loader shared by the payment-runtime stores. In an environment
 * where `prisma generate` has run and a DB is reachable, this returns the
 * Prisma client; otherwise it returns `null` and callers fall back to an
 * in-memory dev/test store. This keeps an uninitialized Prisma client from
 * crashing an unrelated request and makes the runtime stores independently
 * testable (unit + PGlite).
 */

export type LazyPrisma = {
  paymentProviderConnection: unknown;
  secretRecord: unknown;
  durableOperation: unknown;
  auditEvent: unknown;
  canonicalPayment: unknown;
  providerPayment: unknown;
};

export async function loadLazyPrisma(): Promise<LazyPrisma | null> {
  try {
    const mod = (await import("@/lib/db/prisma")) as {
      prisma?: LazyPrisma;
      default?: LazyPrisma;
    };
    const prisma = mod.prisma ?? mod.default;
    if (!prisma?.paymentProviderConnection || !prisma?.durableOperation) {
      // Prisma client constructed but not generated for these models → treat as
      // unavailable rather than throw.
      return null;
    }
    return prisma;
  } catch {
    // `prisma generate` not run / engine unavailable.
    return null;
  }
}
