import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * `APP_ENV` — not `NODE_ENV` — is the deployment's own declaration of where it is
 * running. `.env.example` sets it, `compose.yaml` is expected to set it, and the
 * Sentry configs already read it. Keying production-only requirements off it means
 * a staging build cannot accidentally inherit production strictness, and a
 * production build cannot accidentally skip it.
 */
const isProduction = process.env.APP_ENV === "production";

/**
 * A value that must be present in production and may be absent elsewhere.
 *
 * Audit finding S-07: `XENDIT_WEBHOOK_TOKEN` and `STRIPE_WEBHOOK_SECRET` were
 * `.optional()` with no production requirement, so a deploy that forgot them
 * booted happily. The only backstop was `NODE_ENV === "production"` inside each
 * webhook route, which returns a 500 per request — silent, total webhook loss
 * with nothing failing at boot and nothing alerting. Failing at startup is
 * strictly better than failing per-request forever.
 */
function requiredInProduction(name: string) {
  return isProduction
    ? z.string().min(1, `${name} is required when APP_ENV=production`)
    : z.string().optional();
}

/**
 * The published development default. If this string is still the signing secret in
 * a production deployment, every session cookie is forgeable by anyone who has
 * read this repository — which is public. Refusing to boot is the only safe answer.
 */
const KNOWN_INSECURE_AUTH_SECRET = "dev-secret-change-in-prod-32-chars-long!!";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/xendit"),
    XENDIT_SECRET_KEY: requiredInProduction("XENDIT_SECRET_KEY"),
    // Webhook authenticity. Required in production — see `requiredInProduction`.
    XENDIT_WEBHOOK_TOKEN: requiredInProduction("XENDIT_WEBHOOK_TOKEN"),
    STRIPE_SECRET_KEY: requiredInProduction("STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: requiredInProduction("STRIPE_WEBHOOK_SECRET"),
    // Session signing key. No default in production, and the known development
    // default is rejected outright rather than merely warned about (S-11).
    BETTER_AUTH_SECRET: isProduction
      ? z
          .string()
          .min(32, "BETTER_AUTH_SECRET must be at least 32 characters")
          .refine((v) => v !== KNOWN_INSECURE_AUTH_SECRET, "BETTER_AUTH_SECRET is still the published development default — generate a real secret")
      : z.string().min(32).default(KNOWN_INSECURE_AUTH_SECRET),
    BETTER_AUTH_URL: z.string().url().optional(),
    // Error reporting. Without a DSN there is no server-side error visibility at
    // all (O-01), which is not acceptable in production.
    SENTRY_DSN: requiredInProduction("SENTRY_DSN"),
    APP_ENV: z.string().optional(),
    // Secret-store configuration. "local" is the explicitly-marked encrypted
    // local adapter; LIVE activation is refused unless a production-grade
    // (kms) backend and a valid key are configured. See provider-secrets.
    SECRET_STORE_MODE: z.enum(["local", "kms"]).default("local"),
    SECRET_STORE_KEY: z.string().optional(),
    SECRET_STORE_KMS_KEY_ID: z.string().optional(),
    // Trusted public origin for webhook callback URLs / redirects / OAuth.
    // NOTE: declared here but not yet consumed — payment-link share URLs are
    // still hardcoded to a placeholder domain in `lib/link-status.ts`. Wiring
    // this up is roadmap item 4.5.
    PAYMENTS_PUBLIC_ORIGIN: z.string().url().optional(),
    // Data-source toggle for the MCP server + dashboard stores.
    PAYDASH_DATA_SOURCE: z.enum(["memory", "postgres"]).default("memory"),
    // Bootstrap MCP bearer token fallback (runtime settings override it).
    MCP_ACCESS_TOKEN: z.string().optional(),
    // Service name reported to the OTEL collector. Was hardcoded to "xendit-app"
    // (O-08), a leftover from this repository's origin, which put every trace
    // under a name that does not match the product.
    OTEL_SERVICE_NAME: z.string().min(1).default("paydash-web"),
    // Readiness probe (O-02). Set to "false" only for local development without a
    // database; production must leave it at the default so an instance whose
    // database is unreachable is taken out of rotation instead of served from.
    READY_REQUIRE_DB: z
      .enum(["true", "false"])
      .default("true")
      .refine((v) => isProduction ? v === "true" : true, "READY_REQUIRE_DB must be \"true\" when APP_ENV=production"),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_UMAMI_URL: z.string().url().optional(),
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: z.string().optional(),
    // Read by `instrumentation-client.ts` but previously absent from the schema,
    // so a value that decides whether browser error reporting exists at all was
    // never validated (S-11).
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY,
    XENDIT_WEBHOOK_TOKEN: process.env.XENDIT_WEBHOOK_TOKEN,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    SENTRY_DSN: process.env.SENTRY_DSN,
    APP_ENV: process.env.APP_ENV,
    SECRET_STORE_MODE: process.env.SECRET_STORE_MODE,
    SECRET_STORE_KEY: process.env.SECRET_STORE_KEY,
    SECRET_STORE_KMS_KEY_ID: process.env.SECRET_STORE_KMS_KEY_ID,
    PAYMENTS_PUBLIC_ORIGIN: process.env.PAYMENTS_PUBLIC_ORIGIN,
    PAYDASH_DATA_SOURCE: process.env.PAYDASH_DATA_SOURCE,
    MCP_ACCESS_TOKEN: process.env.MCP_ACCESS_TOKEN,
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
    READY_REQUIRE_DB: process.env.READY_REQUIRE_DB,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_UMAMI_URL: process.env.NEXT_PUBLIC_UMAMI_URL,
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
