import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCookieCache } from "better-auth/cookies";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { demoOrgFallbackPermitted } from "@/lib/demo-org-policy";

// next-intl i18n handler — Addy Osmani: locale negotiation at edge, shell stays cached (locale in URL, not in shell)
// localePrefix: "as-needed" → bare "/transactions" → served as "id" without redirect; "/en/transactions" → explicit
const handleI18nRouting = createMiddleware(routing);

// Reusable proxy (formerly middleware) — NEXTJS #7 proxy, ADR-0004 Better Auth
// Verifies session cookie; redirects unauthenticated from protected routes
// BE-001: fail-closed — default strict, not opt-in. `AUTH_ENFORCED=off|0|false` disables,
// `preview` allows `x-preview-bypass:1` (preview env only), legacy `1|true` = strict.
// Implements: JRN-001 SCR-001..004.
// `/ai-journal` is deliberately NOT here. It was previously listed in both
// PUBLIC_PATHS and APP_ROUTE_PREFIXES, and because the bare-app-route branch
// runs first the same resource had two access rules depending on URL shape:
// `/ai-journal` required a session cookie while `/id/ai-journal` did not. It is
// a merchant tool inside the dashboard shell, so it is protected consistently.
// `AUTH_ENFORCED=off` (local dev, Playwright) still skips the check entirely.
const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/api/auth", "/api/health", "/api/ready", "/_next", "/favicon.ico", "/static"];
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/health", "/api/ready", "/api/webhooks", "/api/vitals"];

export function authMode(): "strict" | "preview" | "off" {
  const raw = process.env.AUTH_ENFORCED;
  if (raw === "off" || raw === "0" || raw === "false") return "off";
  if (raw === "preview") return "preview";
  return "strict"; // default strict (includes "1", "true", undefined)
}

function isPreviewBypass(request: NextRequest): boolean {
  return request.headers.get("x-preview-bypass") === "1" || request.nextUrl.searchParams.get("preview_bypass") === "1";
}

/**
 * Verify the Better Auth session cookie cache — signature-checked, no database.
 *
 * Audit finding S-01. The gate used to be:
 *
 *     request.cookies.has("better-auth.session_token")
 *
 * `cookies.has()` tests for the presence of the *name*. The value was never
 * parsed, never signature-checked, never round-tripped to Better Auth. A request
 * carrying `better-auth.session_token=GARBAGE_NOT_A_REAL_TOKEN` passed, the
 * server-side `getSession()` then returned null, and the resolver handed back
 * OWNER of `org_demo` — which rendered the full seeded ledger on 14 routes and
 * executed Server Action bodies that contain no authorization of their own.
 *
 * `cookieCache.enabled` is set in `src/lib/auth.ts`, so Better Auth also writes a
 * `better-auth.session_data` cookie holding the session payload with an
 * HMAC-SHA256 signature over `{...session, expiresAt}`. `getCookieCache` verifies
 * that signature and the expiry using only Web Crypto, which is why this can run
 * on the edge without a database round-trip on every request. A forged value
 * fails the HMAC; an expired one fails the expiry check.
 *
 * The cache maxAge (7d) equals `session.expiresIn` (7d) and `updateAge` refreshes
 * it daily, so a live session always carries a verifiable cache cookie.
 */
async function hasVerifiedSession(request: NextRequest): Promise<boolean> {
  // Read directly from process.env rather than `@/lib/env`: if the env schema
  // threw inside the middleware, every request in the application would fail.
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return false;
  try {
    // Better Auth prefixes the cookie name with `__Secure-` when it was set over
    // HTTPS. Pick the naming from whichever cookie is actually present rather
    // than guessing from the request protocol, which lies behind a proxy that
    // terminates TLS.
    const isSecure = request.cookies.has("__Secure-better-auth.session_data");
    const payload = await getCookieCache(request, { secret, isSecure });
    return Boolean(payload?.session && payload?.user);
  } catch {
    // An unparsable cookie is an unauthenticated request, not a server error.
    return false;
  }
}

/**
 * The single authentication decision for every protected surface.
 *
 * A request is let through when auth is not being enforced, when its session
 * cookie cache verifies, or when this deployment is permitted to serve the demo
 * organization to an unauthenticated caller (local dev, `AUTH_ENFORCED=off`,
 * Playwright, or an explicit `PAYDASH_ENABLE_DEMO_ORG=true`). In production with
 * the default strict mode, only the middle condition can ever be true.
 */
async function isAuthenticated(request: NextRequest): Promise<boolean> {
  if (!shouldEnforceAuth(request)) return true;
  if (await hasVerifiedSession(request)) return true;
  return demoOrgFallbackPermitted({ previewBypass: isPreviewBypass(request) });
}

export function shouldEnforceAuth(request: NextRequest): boolean {
  const mode = authMode();
  if (mode === "off") return false;
  if (mode === "preview" && isPreviewBypass(request)) return false;
  return true;
}

// Single source of truth for authenticated app routes (kept in sync with
// `next.config.ts` rewrites and `components/layout/sidebar.tsx`). Prefix match
// means dynamic children such as /transactions/[id] and /customers/[id] are
// covered without touching this list again.
const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/transactions",
  "/balance",
  "/customers",
  "/billing",
  "/payouts",
  "/audit",
  "/fraud",
  "/kyc",
  "/settings",
  "/reports",
  "/payments",
  "/subscriptions",
  "/team",
  "/webhooks",
  "/system",
  "/onboarding",
  "/support",
  "/risk",
  "/agent",
  "/ai-journal",
];

/**
 * Exact-or-child match against the public allowlist.
 *
 * The previous implementation ended with `|| pathname.includes(p)`, a *substring*
 * test on an authentication allowlist: any path containing `/sign-in`, `/static`,
 * `/_next` or `/favicon` anywhere was treated as public. Allowlists must be
 * prefix- or exact-match, never substring (audit finding S-01).
 */
function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // "/" renders the root chooser scaffold (app/page.tsx) — pass through.
  if (pathname === "/") {
    return NextResponse.next();
  }

  // API: public endpoints pass, protected endpoints enforce auth (fail-closed)
  // This is defense-in-depth with BE-004 route-level guards; matcher now includes /api.
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (isPublicApi) return NextResponse.next();
    // Protected API (e.g., /api/exports/*, /api/mcp) — fail-closed when enforcing
    if (shouldEnforceAuth(request) && !(await isAuthenticated(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.next();
  }

    // Strip locale prefix from static assets (e.g. /en/_next/... → /_next/...)
    // next-intl's "as-needed" localePrefix adds the locale to all paths,
    // but static chunks must always be served without a locale prefix.
    if (pathname.match(/^\/(en|id)\/_next/)) {
        const url = request.nextUrl.clone();
        url.pathname = pathname.replace(/^\/(en|id)/, "");
        return NextResponse.rewrite(url);
    }
    // Favicon is requested as /en/favicon.ico in dev (browser auto-request with locale prefix)
    if (pathname.match(/^\/(en|id)\/favicon\.ico$/)) {
        const url = request.nextUrl.clone();
        url.pathname = "/favicon.ico";
        return NextResponse.rewrite(url);
    }

  // `/id` is the default-locale root. next-intl's "as-needed" strategy would
  // redirect it to "/" (the chooser scaffold), which reads as a dead-end;
  // rewrite it so both locale roots (/en, /id) land on the app instead.
  if (pathname === `/${routing.defaultLocale}`) {
    const url = request.nextUrl.clone();
    url.pathname = `/${routing.defaultLocale}/dashboard`;
    return NextResponse.rewrite(url);
  }

  const stripped = pathname.replace(/^\/(en|id)(\/|$)/, "/");

  // FE-001: Canonical alias redirect — old routes 308 → canonical, no bookmark break
  // Keep in sync with `components/navigation/nav-config.ts` NAV_ALIASES
  const NAV_ALIASES: Record<string, string> = {
    "/payouts/bulk": "/payouts",
    "/payouts/settings": "/payouts",
    "/payments/platform": "/settings/developer",
    "/reports": "/reports/builder",
  };
  const aliasTarget = NAV_ALIASES[stripped];
  if (aliasTarget) {
    const localeMatch = pathname.match(/^\/(en|id)\//);
    const localePrefix = localeMatch ? `/${localeMatch[1]}` : "";
    const url = request.nextUrl.clone();
    // Preserve query and hash via clone, just swap pathname
    url.pathname = `${localePrefix}${aliasTarget}`;
    return NextResponse.redirect(url, 308);
  }
  // Also handle prefix alias for nested children (e.g., /payouts/bulk/123 → /payouts/123)
  for (const [oldPath, canonical] of Object.entries(NAV_ALIASES)) {
    if (stripped.startsWith(oldPath + "/")) {
      const remainder = stripped.slice(oldPath.length);
      const localeMatch = pathname.match(/^\/(en|id)\//);
      const localePrefix = localeMatch ? `/${localeMatch[1]}` : "";
      const url = request.nextUrl.clone();
      url.pathname = `${localePrefix}${canonical}${remainder}`;
      return NextResponse.redirect(url, 308);
    }
  }

  // 1) i18n first — let next-intl handle locale detection / prefix (as-needed)
  const i18nResponse = handleI18nRouting(request);
  // If i18n wants to redirect (e.g., "/" → locale), honour it
  if (i18nResponse && i18nResponse.status >= 300 && i18nResponse.status < 400) {
    return i18nResponse;
  }

  // 2) Addy Osmani fallback: bare app routes (as-needed) must be rewritten to default locale
  // next-intl's as-needed does not always rewrite bare "/transactions" → "/id/transactions" for app/[locale]
  // We do explicit rewrite so shell stays cached and URL stays bare (PRPL)
  const isAppRoute = APP_ROUTE_PREFIXES.some(
    (prefix) => stripped === prefix || stripped.startsWith(prefix + "/")
  );

  const isBare = !pathname.match(/^\/(en|id)(\/|$)/);
  if (isBare && isAppRoute) {
    if (shouldEnforceAuth(request) && !(await isAuthenticated(request))) {
      const signInUrl = request.nextUrl.clone();
      signInUrl.pathname = `/${routing.defaultLocale}/sign-in`;
      signInUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(signInUrl);
    }
    const url = request.nextUrl.clone();
    url.pathname = `/${routing.defaultLocale}${pathname}`;
    // Rewrite (not redirect) to keep bare URL in browser, but render [locale] page
    const rewriteResponse = NextResponse.rewrite(url);
    // Preserve i18n headers/cookies if any
    if (i18nResponse) {
      i18nResponse.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "x-middleware-rewrite") rewriteResponse.headers.set(key, value);
      });
    }
    return rewriteResponse;
  }

  if (isPublic(stripped) || isPublic(pathname)) {
    // Bare /sign-in and /sign-up used to 404: they live under app/[locale] but
    // carry no locale segment. Rewrite them into the default locale too.
    if (isBare && (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up"))) {
      const url = request.nextUrl.clone();
      url.pathname = `/${routing.defaultLocale}${pathname}`;
      return NextResponse.rewrite(url);
    }
    return i18nResponse ?? NextResponse.next();
  }

  // Verify the Better Auth session — fail-closed (BE-001, audit finding S-01)
  const isProtected = isAppRoute;
  if (isProtected && shouldEnforceAuth(request) && !(await isAuthenticated(request))) {
    const localeMatch = pathname.match(/^\/(en|id)\//);
    const locale = localeMatch ? `/${localeMatch[1]}` : `/${routing.defaultLocale}`;
    const url = request.nextUrl.clone();
    url.pathname = `${locale}/sign-in`;
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Fill-the-void fallback: any other bare path (not "/", not /api, not a
  // static asset) is rewritten into the locale segment so unmatched URLs land
  // on the in-shell 404 (`[locale]/not-found.tsx`) instead of the bare global
  // error page. Locale-prefixed paths already resolve on their own.
  if (isBare && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${routing.defaultLocale}${pathname}`;
    return NextResponse.rewrite(url);
  }

  return i18nResponse ?? NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|_next|en/_next|id/_next).*)"],
};
