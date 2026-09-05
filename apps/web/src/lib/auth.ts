import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";

// Reusable Better Auth — NEXTJS #103, ADR-0004 (swappable to Clerk via lib/auth.ts + proxy.ts)
// Postgres + Prisma adapter, session via DB (no secondaryStorage), emailAndPassword enabled
// baseURL resolves from env; when unset Better Auth falls back to the request origin
// (never a hardcoded localhost — that breaks Cloud Run behind a public origin).
const baseURL = env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_APP_URL;
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  // Secret/URL from env (validated via @t3-oss/env-nextjs, fallback for dev)
  secret: env.BETTER_AUTH_SECRET,
  baseURL,
  emailAndPassword: {
    enabled: true,
    // Require email verification in prod, auto-verify in dev
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7,
    },
  },
  // Extend User with app fields (role, externalId) — additionalFields
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "member",
      },
      externalId: {
        type: "string",
        required: false,
      },
    },
  },
  trustedOrigins: baseURL ? [baseURL] : undefined,
});

// Types for DAL usage
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
