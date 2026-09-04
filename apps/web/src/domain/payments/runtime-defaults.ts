/**
 * Runtime defaults shared by the money-in flow and the provider read path.
 * The app is currently single-tenant (no org-scoping plumbing in the session),
 * so these default to one demo organization. Resolution is always scoped by
 * organization (never cross-org): callers in a multi-tenant deployment pass the
 * real organizationId.
 */
export const DEFAULT_DEMO_ORG = "org_demo";
