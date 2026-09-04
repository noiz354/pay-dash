import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/xendit"),
    XENDIT_SECRET_KEY: z.string().optional(),
    XENDIT_WEBHOOK_TOKEN: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    BETTER_AUTH_SECRET: z.string().min(32).default("dev-secret-change-in-prod-32-chars-long!!"),
    BETTER_AUTH_URL: z.string().url().optional(),
    SENTRY_DSN: z.string().optional(),
    APP_ENV: z.string().optional(),
    // Secret-store configuration. "local" is the explicitly-marked encrypted
    // local adapter; LIVE activation is refused unless a production-grade
    // (kms) backend and a valid key are configured. See provider-secrets.
    SECRET_STORE_MODE: z.enum(["local", "kms"]).default("local"),
    SECRET_STORE_KEY: z.string().optional(),
    SECRET_STORE_KMS_KEY_ID: z.string().optional(),
    // Trusted public origin for webhook callback URLs / redirects / OAuth.
    PAYMENTS_PUBLIC_ORIGIN: z.string().url().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_UMAMI_URL: z.string().url().optional(),
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: z.string().optional(),
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
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_UMAMI_URL: process.env.NEXT_PUBLIC_UMAMI_URL,
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
