import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    // Addy Osmani: bare app routes → default locale (id) for as-needed
    // Keeps URL bare in browser (rewrite, not redirect) — shell cached, locale resolved at edge via proxy
    // Covers all [locale] pages so direct /transactions etc. don't 404 when proxy not yet rewrote
    const appRoutes = [
      "/dashboard",
      "/transactions",
      "/balance",
      "/customers",
      "/billing",
      "/payouts",
      "/payouts/bulk",
      "/payouts/settings",
      "/audit",
      "/fraud",
      "/fraud/blocklist",
      "/kyc",
      "/settings",
      "/settings/merchant",
      "/settings/notifications",
      "/settings/api-keys",
      "/settings/developer",
      "/reports",
      "/reports/builder",
      "/payments",
      "/payments/links",
      "/subscriptions",
      "/team",
      "/webhooks",
      "/system",
      "/onboarding",
      "/support",
      "/risk",
      "/ai-journal",
      "/ai-journal/ops-copilot",
      "/ai-journal/recovery-agent",
      "/ai-journal/readiness-agent",
      "/ai-journal/evaluation",
    ];
    const dynamicRoutes = [
      // Detail routes reached from ledger rows / row actions
      { source: "/transactions/:id", destination: "/id/transactions/:id" },
      { source: "/customers/:id", destination: "/id/customers/:id" },
      { source: "/billing/:id", destination: "/id/billing/:id" },
    ];
    return [
      ...appRoutes.map((source) => ({ source, destination: `/id${source}` })),
      ...dynamicRoutes,
    ];
  },
  async headers() {
    // Reusable security headers — docs/ARCHITECTURE.md:36 + NEXTJS_CONCEPTS.md #154 ESLint, #36 instrumentation
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net https://apis.google.com https://www.gstatic.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://apis.google.com https://accounts.google.com https://googleapis.com https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://*.gstatic.com",
              "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
              "form-action 'self' https://accounts.google.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), { silent: true });
