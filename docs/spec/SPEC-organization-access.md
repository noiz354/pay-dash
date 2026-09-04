# Spec: Organization Access (RBAC)

> Module ID: `organization-access`
> Initiative map: `docs/spec/payment-platform-capability-map.md`
> Status: **IMPLEMENTED (role/permission contract) — VERIFY GATE**
> Date: 2026-09-03 (+07:00)
> Inputs: `xendit-platform-product-decisions.md` §§4–5; `SPEC-provider-domain.md`; `payment-provider-plugin-and-agent-skills.md` §12.

## Decision

Replace the broad `User.role` (ADMIN/DEVELOPER/ANALYST/RISK_ANALYST) assumptions with organization-scoped roles that can authorize money movement. Authorization is always resolved from authenticated membership, never from the browser.

## Roles

```text
OWNER              governance + emergency authority, all finance perms
FINANCE_ADMIN      create/release payouts, refunds, transfers, split activation, recurring
FINANCE_OPERATOR   prepare drafts/imports; cannot release/approve own sensitive op
DEVELOPER          integration config, test connect, webhook diagnostics; no live money
ANALYST            read/export only
COMPLIANCE_ANALYST KYC case review + submission prep; no money movement
RISK_ANALYST       risk review/recommend holds; no direct release
SUPPORT            limited customer/payment inspection; may prepare refund request
```

## Permission catalog (selected)

`provider.connect.live|test`, `provider.rotate`, `provider.disconnect`, `payout.create|release|cancel|retry`, `refund.prepare|execute`, `transfer.execute`, `split.prepare|activate`, `kyc.prepare|submit`, `recurring.create|immediate_charge`, `report.export`, `customer.read`, `transaction.read`, `audit.read`, `team.manage`, `settings.manage`.

## Rules

- `ROLE_PERMISSIONS` is least-privilege; no role inherits another implicitly.
- `hasPermission(role, perm)` and `authorizeRoles(roles, perm)` (ANY role grants).
- `parseRoles` keeps only valid roles (unknown/typed entries dropped).
- Dual control + MFA are not implemented here; they are enforced by `financial-step-up` at execution time.

## Files

```text
apps/web/src/domain/organization/roles.ts
apps/web/src/domain/organization/roles.test.ts
```

## Tests

- Role catalog has 8 members; privileges are least-privilege (ANALYST no payout.release, SUPPORT no refund.execute, DEVELOPER no live connect).
- OWNER has every financial permission.
- authorizeRoles grants when any held role grants.
- parseRoles rejects unknown roles.
