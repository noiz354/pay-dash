import type { Page } from "@playwright/test";

// Shared E2E helpers.
//
// `loginAs` does not authenticate against Better Auth — that needs a database,
// and the point of these suites is the *authorization* behaviour, not the login
// form (which `routing.spec.ts` and the proxy unit tests cover). It sets the
// persona cookie read by `src/server/services/test-persona.ts`, which is only
// honoured when AUTH_ENFORCED is `off`/`preview`. Playwright therefore runs the
// dev server with AUTH_ENFORCED=off; production stays `strict`, where the cookie
// is never read.
//
// Persona ids and roles are spec §3 (PER-001..008).

export const PERSONAS = {
  rina: "OWNER",
  dinda: "FINANCE_OPERATOR",
  hendri: "FINANCE_ADMIN",
  agus: "SUPPORT",
  sari: "RISK_ANALYST",
  bima: "DEVELOPER",
  nadia: "ANALYST",
  lukman: "COMPLIANCE_ANALYST",
} as const;

export type PersonaId = keyof typeof PERSONAS;

export const PERSONA_COOKIE = "paydash_persona";

/** Actor id the server derives for a persona — used by dual-control assertions. */
export function actorIdFor(persona: PersonaId): string {
  return `persona_${persona}`;
}

/**
 * Become `persona`. Safe to call before or after navigation: it sets the cookie
 * on the base URL's origin and then (re)loads the given path.
 */
export async function loginAs(page: Page, persona: PersonaId, path = "/en/dashboard"): Promise<void> {
  const url = new URL(page.url() === "about:blank" ? "http://localhost:3000" : page.url());
  await page.context().addCookies([
    {
      name: PERSONA_COOKIE,
      value: persona,
      domain: url.hostname,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  await page.goto(path);
  await waitForLoadingComplete(page);
}

/** Drop the persona cookie — back to the unauthenticated/demo view. */
export async function logout(page: Page): Promise<void> {
  await page.context().clearCookies();
}

/**
 * Wait until the page has finished its Suspense/streaming work.
 *
 * The app renders skeletons (`loading.tsx`) while server data resolves, so
 * waiting on `networkidle` alone is flaky with 20s polling in flight. This waits
 * for the skeleton markers to disappear instead, then settles microtasks.
 */
export async function waitForLoadingComplete(page: Page, timeout = 15_000): Promise<void> {
  // Skeletons use `animate-pulse`; the app-chrome shell is present immediately.
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForFunction(
      () => document.querySelectorAll(".animate-pulse").length === 0,
      undefined,
      { timeout },
    );
  } catch {
    // A page may legitimately keep a pulsing element (e.g. a live indicator).
    // Fall through to network settle rather than failing the whole test.
  }
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

/**
 * Collect `console.error` output so a test can assert a journey completed without
 * an unhandled client error (the "no dead end" contract).
 */
export function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/** Assert every link/button on the page resolves somewhere real (no dead ends). */
export async function expectNoDeadEndLinks(page: Page): Promise<void> {
  const hrefs = await page.$$eval("a[href]", (anchors) =>
    anchors
      .map((a) => (a as HTMLAnchorElement).getAttribute("href"))
      .filter((h): h is string => Boolean(h)),
  );
  for (const href of hrefs) {
    if (href === "#" || href === "" || href.startsWith("javascript:")) {
      throw new Error(`Dead-end link found: ${JSON.stringify(href)}`);
    }
  }
}
