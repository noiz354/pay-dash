/**
 * The single answer to "may an unauthenticated request be served the demo
 * organization?" — shared by the edge gate (`src/proxy.ts`) and the server-side
 * context resolver (`src/server/services/session-org-context.ts`).
 *
 * Audit findings S-01 and §3.5. Before this module existed the two layers
 * answered that question differently, and both answered it by accident:
 *
 *   - `src/proxy.ts` checked only that a cookie *named* `better-auth.session_token`
 *     existed. It never looked at the value. A request carrying
 *     `better-auth.session_token=GARBAGE` passed the gate.
 *   - `resolveSessionOrgContext()` then called `auth.api.getSession()`, which
 *     returned null (invalid token) or threw (database unreachable), and *both*
 *     branches landed on `demoOrgContext()` — role OWNER, organization
 *     `org_demo`. Every app route rendered the full seeded ledger.
 *
 * The result was that an unauthenticated caller received HTTP 200 and the entire
 * financial dataset on 14 routes, while the export routes — which check
 * `isDemoFallback` themselves — correctly returned 401 for the same request. The
 * product was protected inconsistently, by accident.
 *
 * This module is deliberately not `server-only`: the middleware runs on the edge
 * runtime and must be able to import it.
 */

/**
 * `AUTH_ENFORCED` semantics, unchanged from the original `proxy.ts`:
 *   off     → auth is not enforced at all (local dev, Playwright)
 *   preview → enforced, except for a request carrying the preview bypass
 *   strict  → enforced (the default, including when the variable is unset)
 *
 * Unknown values fall through to `strict`, so a typo fails safe.
 */
export type AuthEnforcementMode = "strict" | "preview" | "off";

export function authEnforcementMode(env: NodeJS.ProcessEnv = process.env): AuthEnforcementMode {
  const raw = env.AUTH_ENFORCED;
  if (raw === "off" || raw === "0" || raw === "false") return "off";
  if (raw === "preview") return "preview";
  return "strict";
}

/**
 * Whether this deployment is production. Keyed off `APP_ENV` first because that
 * is the deployment's own declaration (`.env.prod.example` sets it and
 * `compose.yaml` passes it); `NODE_ENV` is the fallback because `next start`
 * sets it and a deployment that forgets `APP_ENV` must still be treated as
 * production rather than accidentally permissive.
 */
export function isProductionDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.APP_ENV === "production" || env.NODE_ENV === "production";
}

/**
 * May an unauthenticated request resolve to the demo organization?
 *
 * `PAYDASH_ENABLE_DEMO_ORG` is an explicit override in both directions:
 *   "true"  → permit, even in production (a hosted demo or a staging showcase)
 *   "false" → refuse, even in development (this is how the strict path is tested
 *             locally, and how the edge gate is exercised without a database)
 *
 * With no override: `AUTH_ENFORCED=off` means the deployment has declared that it
 * does not enforce auth, so the demo org is the point. A preview bypass is the
 * same declaration for one request. Otherwise the answer is the inverse of
 * "is this production" — development and test keep the demo dataset that makes
 * the dashboard usable without a database, and production never serves
 * financial data to a request it could not authenticate.
 */
export function demoOrgFallbackPermitted(
  input?: { previewBypass?: boolean },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const explicit = env.PAYDASH_ENABLE_DEMO_ORG;
  if (explicit === "true" || explicit === "1") return true;
  if (explicit === "false" || explicit === "0") return false;

  const mode = authEnforcementMode(env);
  if (mode === "off") return true;
  if (mode === "preview" && input?.previewBypass) return true;

  return !isProductionDeployment(env);
}

/**
 * The organization id handed to a request that could not be authenticated when
 * the demo fallback is not permitted.
 *
 * This is a sentinel that matches no tenant, not `org_demo`. Returning an empty
 * role list alone would not be enough: the seeded ledger is tagged `org_demo`,
 * so a context carrying that id with no roles would still satisfy the tenant
 * predicate on every read path and return the whole demo dataset. Reads must
 * scope to an organization that has no rows.
 */
export const UNAUTHENTICATED_ORG = "org_unauthenticated";
