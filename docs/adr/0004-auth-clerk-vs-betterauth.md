# ADR-0004: Auth — Clerk (default) vs Better Auth

Date: 2026-08-30
Status: Accepted

## Context
Screens `team_permissions` / `team_permissions_desktop` and `api_key_management` have no Xendit SDK (`INTEGRATION.md:313-324`) — RBAC must be app-owned. Stack plan lists Clerk for speed, Better Auth/Auth.js for self-owned.

## Decision
We will default to **Clerk** (`@clerk/nextjs`, `clerkMiddleware()` in `proxy.ts`, `auth()` server helper) for fastest production. If self-hosting/custom ownership is required, we will switch to **Better Auth** — both satisfy the DAL + `server-only` constraint. Only one provider ships in `apps/web`.

## Consequences
Positive: Clerk gives sessions/MFA/social/RBAC out of box; Better Auth gives full data ownership. Negative: Clerk is vendor lock-in; Better Auth needs more wiring.

## Alternatives Considered
Auth.js — viable self-owned alternative to Better Auth. Custom auth — rejected; risk for payment app.

## Verification
Protected route redirects when unauthenticated; Server Action rejects without session; DAL check blocks cross-tenant `forUserId` access (`INTEGRATION.md:369`).
