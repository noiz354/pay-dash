# Spec: Financial Step-Up

> Module ID: `financial-step-up`
> Initiative map: `docs/spec/payment-platform-capability-map.md`
> Status: **IMPLEMENTED (challenge binding + dual-control policy) — VERIFY GATE**
> Date: 2026-09-03 (+07:00)
> Inputs: `xendit-platform-product-decisions.md` §§12; `payment-provider-plugin-and-agent-skills.md` §12.

## Decision

Sensitive financial/platform operations require operation-bound step-up proof and, where the threshold applies, dual control. The actual WebAuthn/TOTP proof is carried by the auth layer; this module defines binding, expiry, single-use, and threshold applicability.

## Challenge binding

```ts
interface StepUpBinding {
  operationType, organizationId, actorId, resourceId?, resourceVersion?,
  amountMinor?, currency?, destinationCount?, destinationRefs?, splitRuleVersion?,
  nonce, expiresAt;
}
Type StepUpChallenge = { challengeId, binding, digest, expiresAt, nonce, used };
```

- `challengeDigest` = sha256 of a canonical, destination-sorted binding; reorder-safe.
- `createStepUpChallenge`, `verifyStepUpProof` (checks unused, not expired, nonce match, digest match), `markProofUsed`.
- `requiresDualControl(kind, args)` + `isApproverDistinct(requester, approver)`.
- Bindings bind: operation type, resource/version, amount/currency, destination/account count, organization, actor, expiry, nonce. Changing amount/destination/split/version invalidates the proof.

## Dual-control baseline (configurable; IDR initial)

```text
payout:            >= IDR 25,000,000 per recipient OR >= IDR 100,000,000 per batch
refund:            >= IDR 10,000,000 OR > 50% of original payment
platform transfer: every LIVE transfer
split activation:  every LIVE change
recurring immediate payment: >= IDR 10,000,000
```

Requester may not be the sole approver when dual control applies. SMS alone is insufficient; WebAuthn/passkey preferred, TOTP fallback.

## Files

```text
apps/web/src/domain/security/step-up.ts
apps/web/src/domain/security/step-up.test.ts
```

## Tests

- identical binding verifies; changed amount/destination/version fails; single-use fails after use; expired fails; nonce mismatch fails; destination reorder still verifies.
- dual-control: live transfer/split always; payout per-recipient & per-batch thresholds; refund amount threshold; >50% original rule; recurring immediate threshold; approver distinct.
