# Wave 8 — MCP & Auth Hardening (Spec)

Date: 2026-09-13 · Branch: `wave-7d-derived-scoping` (main@a4b595a)
Predecessors: Waves 7A–7C (tenant isolation); TODO.md R1–R6; D-05, D-06, D-07, D-08, D-20
Status: **Proposed**

---

## 0. Runtime baseline (measured, not carried over)

| Gate | Result 2026-09-13 |
|---|---|
| Full suite | **1472 passed / 17 failed** (15 pre-existing env `DATABASE_URL` unset + 2 pre-existing calendar flakes) |
| Typecheck | clean · Lint 0 errors / 40 warnings (== D-17) |

## 1. Goal

> Every automated entry point (MCP endpoint, sign-in) is throttled, every MCP call is
> attributable in the audit log, token comparison leaks nothing through timing, and
> write-capable tokens are scoped — so a leaked token or a brute-force loop buys the
> attacker as little as possible. Rate-limited callers get a truthful 429 with a
> usable retry path, not a silent drop.

## 2. Standard (applies to every item below)

Denial without oracle: 401 reason strings stay generic (`Invalid MCP token` — no
"wrong length" vs "wrong value" distinction); 429 carries `Retry-After` + a
machine-readable `retry_after_sec` body field; audit entries record digests, never raw
tokens or PII; limits are keyed (IP + token), never global-only (one abuser must not
throttle everyone).

## 3. Gaps (file:line evidence, checkout `a4b595a`)

- **P-1** `server/mcp/auth.ts:25` — `candidate !== token` is a short-circuit string
  comparison (D-08, TODO R3): replace with `crypto.timingSafeEqual` after equal-length
  normalization (length check first is fine — length is not secret for fixed-length tokens;
  document this reasoning in-file).
- **P-2** `app/api/mcp/route.ts` (`handleMcpRequest`) — no rate limiting (D-06, TODO R1):
  add `assertMcpRateLimit` (keyed IP + token, 10-minute window) called before auth/tools.
  Unauthenticatedсью requests count against the IP bucket; authenticated against IP+token.
- **P-3** No MCP call audit (D-07, TODO R2): record every `tools/call` (tool name, args
  digest, ok/err, timestamp) to the audit seam (`server/data/audit.ts` / pino). Args are
  digested (SHA-256, truncated), never stored raw — tool args can carry customer emails.
- **P-4** Single global bearer token with full power (TODO R5): add `mcpScope` to runtime
  settings; token issuance gains read-only vs write split; write tools refuse read-only
  tokens with the uniform not-found/forbidden shape the tenant contract already uses.
  Verify current issuance path at Q2 (settings store + setup UI).
- **P-5** Sign-in rate limiting not implemented (D-05, spec §8): 5 attempts/min/IP +
  captcha-after-3-fails → 429. Verify sign-in route + captcha provider seam at Q2.
- **P-6** 429 UX unfinished (D-20): `Retry-After` header + "Too many requests — Retry
  after …" toast path exists in the track/events layer; finish the client handling
  (countdown, disabled retry button, no dead toast).
- **Out of scope**: TODO R4/R6 (Firebase/gcloud active-project + chromium path) —
  environment-local config, not repo work. No ticket, no spec.

## 4. Design

One module per gate, composed at the two doors: `server/mcp/rate-limit.ts` (new;
in-memory buckets with the same swap-for-Redis seam shape as the denial sink),
`server/mcp/call-audit.ts` (new; digest + sink), scope check inside `auth.ts` result
(consumers already branch on `ok`), sign-in limiter beside the session logic.
No schema migration (buckets are ephemeral; audit rows reuse the audit store).

## 5. Tests

- **H-1..H-10** hardening: burst over limit ⇒ 429 + `Retry-After` (IP bucket and
  IP+token bucket independently); audit row per call with digest≠raw; timing test
  (comparison time independent of match position — statistical, N=1000, document
  flakiness guard); read-only token refused on write tools, allowed on reads;
  sign-in 6th attempt in 60s ⇒ 429; captcha flag after 3 fails; toast countdown renders.
- **Mutation-style negatives** (7-series Q6 habit, adapted): limiter removed ⇒ burst test
  red; digest replaced by raw args ⇒ audit-shape test red; `!==` restored ⇒ timing test
  red; scope check skipped ⇒ write-with-read-token test red.
- Gates: full suite + typecheck + lint unchanged baselines; no new quarantine (nothing
  here is tenant-scoped state — RLS/ctx untouched).

## 6. Plan (serial)

Q0 spec (this doc) → Q1 failing tests (red: no limiter, no audit rows, `!==` present,
unscoped tokens) → Q2 rate-limit + audit + timingSafeEqual + scopes + sign-in limiter +
429 UX → Q3 legacy/adjacent test updates → Q4 docs (runbook: limits, buckets, rotation) →
Q5 full gates → Q6 4 negative checks above → Q7 report + matrix (per-tool allow/deny table) +
ADR-0049 + close D-05/D-06/D-07/D-08/D-20 + commit one slice.
