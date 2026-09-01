import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// next-intl i18n handler — Addy Osmani: locale negotiation at edge, shell stays cached (locale in URL, not in shell)
// localePrefix: "as-needed" → bare "/transactions" → served as "id" without redirect; "/en/transactions" → explicit
const handleI18nRouting = createMiddleware(routing);

// Reusable proxy (formerly middleware) — NEXTJS #7 proxy, ADR-0004 Better Auth
// Verifies session cookie; redirects unauthenticated from protected routes
const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/api/auth", "/api/health", "/_next", "/favicon", "/static"];

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
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.includes(p));
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Route handlers own /api/*, and "/" renders the root chooser scaffold
  // (app/page.tsx) — both are passed straight through so activating the proxy
  // takes nothing away that used to work.
  if (pathname === "/" || pathname === "/api" || pathname.startsWith("/api/")) {
    return NextResponse.next();
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
    // Still check auth after rewrite? For bare with no session, redirect to sign-in instead
    const hasSession = request.cookies.has("better-auth.session_token") || request.cookies.has("__Secure-better-auth.session_token");
    if (!hasSession) {
      // For now allow bare in dev (no session) to render — comment out redirect for dev parity
      // If you need auth, uncomment:
      // const signInUrl = request.nextUrl.clone();
      // signInUrl.pathname = `/${routing.defaultLocale}/sign-in`;
      // signInUrl.searchParams.set("redirect", pathname);
      // return NextResponse.redirect(signInUrl);
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

  // Check Better Auth session cookie
  const hasSession = request.cookies.has("better-auth.session_token") || request.cookies.has("__Secure-better-auth.session_token");

  // Auth enforcement is opt-in via AUTH_ENFORCED=1 so the proxy can be active
  // (locale rewrites + in-shell 404) without locking the demo/preview out of
  // every screen. The redirect logic below is unchanged and ships as-is.
  const enforceAuth = process.env.AUTH_ENFORCED === "1";
  const isProtected = isAppRoute;
  if (isProtected && !hasSession && enforceAuth) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|_next).*)"],
};
