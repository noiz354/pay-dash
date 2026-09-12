# ADR-0030: Auth is fail-closed (default strict)

**Status:** Accepted (Wave 0, `9bf01dd`)

## Context
`proxy.ts` treated auth as opt-in (`AUTH_ENFORCED === "1"`); a missing or mistyped env value meant the gate was **off** — protected routes and API paths were reachable without a session. For a money console that is a P0: the failure mode was data/money access, not a broken page.

## Decision
`AUTH_ENFORCED` is a three-value mode — `strict` (default) | `preview` | `off`. Any value other than the explicit `off`/`0`/`false`/`preview` forms resolves to **strict** (including `1`/`true`/undefined). Strict: protected routes 302 → sign-in, API 401, public prefixes only (`/api/auth`, `/api/health`, `/api/webhooks`, `/api/vitals`). Preview: `x-preview-bypass: 1` from dev proxies only. Off: development only.

## Alternatives
- **Opt-in strict** (status quo): rejected — the unsafe state is the default.
- **Per-route decorators only:** rejected — the edge gate is the one choke point that also covers `/api/*` passthrough.

## Trade-offs
Local dev without a session sees 401s (mitigated: `off` mode is documented for local; preview bypass for demos). A mistyped env value now fails *closed* — which can look like "auth broke" when it is actually the intended safety behavior (runbook Case 1 documents how to tell them apart).

## Consequences
- `proxy.test.ts` (7/7) pins the mode parsing; `proxy.alias.test.ts` (6/6) pins alias behavior under the gate.
- The E2E persona cookie is honored only in off/preview — asserted in `test-persona.test.ts` (16/16); strict never reads it.
- Rollback = one env value (no code).
- Open item: sign-in rate limiting (D-05) is the remaining P0 hardening on this surface.
