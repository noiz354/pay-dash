# Prompt: Xendit-Node Mapping — What Can xendit-node Do?

> **MANDATORY: Read this entire file before writing any code.** Every coding agent assigned to xendit-node work in this repo must follow this prompt verbatim. Do not start implementation until the 5-iteration Missing Audit (§7) is complete.

---

## 0. Pre-reads (in order, no skipping)

1. `INTEGRATION.md:1-370` — screen→SDK mapping, verified recipes, webhook flow, no-API screens.
2. `apps/web/src/lib/xendit.ts:1-35` — server-only wrapper (`server-only`, null-safe when `XENDIT_SECRET_KEY` missing). Verify `isXenditConfigured()` at `xendit.ts:33`.
3. `apps/web/node_modules/xendit-node/index.d.ts:1-25` — top-level `Xendit` exports 8 clients: `Customer, PaymentRequest, Transaction, Balance, PaymentMethod, Refund, Payout, Invoice`.
4. Per-client API definitions (authoritative, auto-generated — do not hand-edit):
   - `balance_and_transaction/apis/Balance.d.ts:14` — `getBalance`
   - `balance_and_transaction/apis/Transaction.d.ts:18` — `getAllTransactions`, `getTransactionByID`
   - `invoice/apis/Invoice.d.ts:18` — `createInvoice`, `getInvoiceById`, `getInvoices`, `expireInvoice`
   - `payout/apis/Payout.d.ts:20` — `createPayout`, `getPayoutById`, `getPayoutChannels`, `getPayouts`, `cancelPayout`
   - `customer/apis/Customer.d.ts:18` — `createCustomer`, `getCustomer`, `getCustomerByReferenceID`, `updateCustomer`
   - `payment_request/apis/PaymentRequest.d.ts:28` — `createPaymentRequest`, `getPaymentRequestByID`, `getPaymentRequestCaptures`, `getAllPaymentRequests`, `capturePaymentRequest`, `authorizePaymentRequest`, `resendPaymentRequestAuth`, `simulatePaymentRequestPayment`
   - `payment_method/apis/PaymentMethod.d.ts:31` — `createPaymentMethod`, `getPaymentMethodByID`, `getPaymentsByPaymentMethodId`, `patchPaymentMethod`, `getAllPaymentMethods`, `expirePaymentMethod`, `authPaymentMethod`, `simulatePayment`
   - `refund/apis/Refund.d.ts:18` — `createRefund`, `getRefund`, `getAllRefunds`, `cancelRefund`
5. `SCREENS.md:7-49` — 33 prototypes (14 mobile + 19 desktop) → `PROGRESS.md:20-58` migration status.
6. `apps/web/src/server/data/*.ts` — 12 in-memory stores (`balance.ts`, `transactions.ts`, `invoices.ts`, `payouts.ts`, `customers.ts`, `links.ts`, `subscriptions.ts`, `webhooks.ts`, `kyc.ts`, `settings.ts`, `team.ts`, `risk.ts`, `blocklist.ts`, `audit.ts`, `onboarding.ts`). Currently **mock-derived**, not live Xendit.
7. `apps/web/src/app/api/webhooks/xendit/route.ts:14-85` — verify `x-callback-token` → Zod parse → `recordInbound`/`rejectInbound` → 200 fast → `processWebhookAsync` TODO.
8. `docs/ARCHITECTURE.md:26-32` — DAL + `server-only` boundary, `docs/STACK.md:26` payments row, `docs/adr/0003-postgres-prisma.md:13` `forUserId` pattern.

---

## 1. SDK Inventory — 8 Clients, 36 Methods (xendit-node@7.0.0, Node 18+)

| # | Client | Method | Key Params | Purpose |
|---|--------|--------|------------|---------|
| 1 | **Balance** | `getBalance({accountType?, currency?, atTimestamp?, forUserId?})` | `CASH/HOLDING/TAX` enum `GetBalanceAccountTypeEnum` | Real-time balance; `atTimestamp` for point-in-time |
| 2 | **Transaction** | `getAllTransactions({types?, statuses?, channelCategories?, referenceId?, productId?, accountIdentifier?, amount?, currency?, created?, updated?, limit?, afterId?, beforeId?, forUserId?})` | `TransactionTypes`, `TransactionStatuses`, `DateRangeFilter` | Universal ledger query |
| 3 | **Transaction** | `getTransactionByID({id, forUserId?})` | — | Single ledger entry |
| 4 | **Invoice** | `createInvoice({data, forUserId?})` | `CreateInvoiceRequest` | Hosted invoice creation |
| 5 | **Invoice** | `getInvoiceById({invoiceId, forUserId?})` | — | Fetch one invoice |
| 6 | **Invoice** | `getInvoices({forUserId?, externalId?, statuses?, limit?, createdAfter?, createdBefore?, paidAfter?, paidBefore?, expiredAfter?, expiredBefore?, lastInvoice?, clientTypes?, paymentChannels?, onDemandLink?, recurringPaymentId?})` | `InvoiceStatus` | List/filter invoices |
| 7 | **Invoice** | `expireInvoice({invoiceId, forUserId?})` | — | Manually expire |
| 8 | **Payout** | `createPayout({idempotencyKey!, forUserId?, data?})` | `CreatePayoutRequest` + `idempotencyKey` REQUIRED | Disbursement to bank/e-wallet |
| 9 | **Payout** | `getPayoutById({id, forUserId?})` | — | Fetch payout status |
| 10 | **Payout** | `getPayoutChannels({currency?, channelCategory?, channelCode?, forUserId?})` | — | List supported banks/e-wallets |
| 11 | **Payout** | `getPayouts({referenceId!, limit?, afterId?, beforeId?, forUserId?})` | `referenceId` REQUIRED | List by reference |
| 12 | **Payout** | `cancelPayout({id, forUserId?})` | status must be `ACCEPTED` | Cancel before partner send |
| 13 | **Customer** | `createCustomer({idempotencyKey?, forUserId?, data?})` | `CustomerRequest` | Create customer for Invoice/PaymentRequest |
| 14 | **Customer** | `getCustomer({id, forUserId?})` | — | Fetch by Xendit ID |
| 15 | **Customer** | `getCustomerByReferenceID({referenceId, forUserId?})` | — | Fetch by your reference |
| 16 | **Customer** | `updateCustomer({id, forUserId?, data?})` | `PatchCustomer` | Update existing |
| 17 | **PaymentRequest** | `createPaymentRequest({idempotencyKey?, forUserId?, withSplitRule?, data?})` | `PaymentRequestParameters` (EWALLET/QR_CODE/VA/CARD) | Modern payment creation |
| 18 | **PaymentRequest** | `getPaymentRequestByID({paymentRequestId, forUserId?})` | — | Fetch one |
| 19 | **PaymentRequest** | `getPaymentRequestCaptures({paymentRequestId, forUserId?, limit?})` | — | List captures |
| 20 | **PaymentRequest** | `getAllPaymentRequests({forUserId?, referenceId?, id?, customerId?, limit?, beforeId?, afterId?})` | — | List/filter |
| 21 | **PaymentRequest** | `capturePaymentRequest({paymentRequestId, forUserId?, data?})` | `CaptureParameters` | 2-step card capture |
| 22 | **PaymentRequest** | `authorizePaymentRequest({paymentRequestId, forUserId?, data?})` | `PaymentRequestAuthParameters` | Authorize |
| 23 | **PaymentRequest** | `resendPaymentRequestAuth({paymentRequestId, forUserId?})` | — | Resend OTP/auth |
| 24 | **PaymentRequest** | `simulatePaymentRequestPayment({paymentRequestId})` | — | Test-mode simulate |
| 25 | **PaymentMethod** | `createPaymentMethod({forUserId?, data?})` | `PaymentMethodParameters` | Vault method (card/e-wallet/DD/VA/OTC/QR) |
| 26 | **PaymentMethod** | `getPaymentMethodByID({paymentMethodId, forUserId?})` | — | Fetch vaulted method |
| 27 | **PaymentMethod** | `getPaymentsByPaymentMethodId({paymentMethodId, forUserId?, ...filters})` | — | Payments for method |
| 28 | **PaymentMethod** | `patchPaymentMethod({paymentMethodId, forUserId?, data?})` | `PaymentMethodUpdateParameters` | Toggle ACTIVE/INACTIVE, update VA/OTC |
| 29 | **PaymentMethod** | `getAllPaymentMethods({forUserId?, id?, type?, status?, reusability?, customerId?, referenceId?, afterId?, beforeId?, limit?})` | `PaymentMethodStatus`, `PaymentMethodReusability` | List vaulted |
| 30 | **PaymentMethod** | `expirePaymentMethod({paymentMethodId, forUserId?, data?})` | `PaymentMethodExpireParameters` | Expire + unlink |
| 31 | **PaymentMethod** | `authPaymentMethod({paymentMethodId, forUserId?, data?})` | `PaymentMethodAuthParameters` | Validate linking OTP |
| 32 | **PaymentMethod** | `simulatePayment({paymentMethodId, data?})` | `SimulatePaymentRequest` | Make payment with method |
| 33 | **Refund** | `createRefund({idempotencyKey?, forUserId?, data?})` | `CreateRefund` | Create refund |
| 34 | **Refund** | `getRefund({refundID, idempotencyKey?, forUserId?})` | — | Fetch one |
| 35 | **Refund** | `getAllRefunds({forUserId?, paymentRequestId?, invoiceId?, paymentMethodType?, channelCode?, limit?, afterId?, beforeId?})` | — | List refunds |
| 36 | **Refund** | `cancelRefund({refundID, idempotencyKey?, forUserId?})` | — | Cancel |

> All methods support optional `forUserId` for platform/sub-merchant (see `INTEGRATION.md:332-339`).

---

## 2. What Can xendit-node Be Used For — Capability → Screen Mapping

### A. Money-In (Receive Payments)

| Capability | SDK Methods | Prototype Screens (SCREENS.md) | Current Store (mock) | Live Wiring Notes |
|------------|-------------|-------------------------------|----------------------|-------------------|
| Hosted invoice / payment link | `Invoice.createInvoice`, `getInvoices`, `getInvoiceById`, `expireInvoice` | `payment_links_invoices` + `billing_invoices_desktop` | `server/data/links.ts`, `invoices.ts` | Replace derived status with live; `expireInvoice` maps to "Cancel/Expire Link" |
| QR / e-wallet / VA / card payment | `PaymentRequest.createPaymentRequest` etc. (8 methods) | Same as above (modern alternative) | Same | Preferred for ShopeePay/QRIS/VA (`INTEGRATION.md:189-203`); `simulatePaymentRequestPayment` for TEST MODE |
| Vaulted / recurring payments | `PaymentMethod.*` (8) + `PaymentRequest.capture/authorize` | `subscription_management` (mock 10 plans `subscriptions.ts`), `customer_directory` | `subscriptions.ts`, `customers.ts` | New tab `customers/[id] → Payment Methods`; `PaymentMethod` not in `INTEGRATION.md` §4 — gap to close |

### B. Money-Out (Disbursements)

| Capability | SDK | Screens | Store | Notes |
|------------|-----|---------|-------|-------|
| Bulk payout to bank/e-wallet | `Payout.createPayout` (idempotencyKey!), `getPayouts`, `getPayoutById` | `bulk_payouts_desktop`, `payout_settings` | `payouts.ts` | `nanoid` for idempotencyKey `docs/STACK.md:51`; `cancelPayout` enables "Cancel batch" when ACCEPTED |
| Payout channel discovery | `Payout.getPayoutChannels` | `payout_settings` | `payouts.ts` | Dropdown of banks/e-wallets by currency |

### C. Ledger, Balance & Reporting

| Capability | SDK | Screens | Store | Notes |
|------------|-----|---------|-------|-------|
| Real-time balance | `Balance.getBalance` | `balance_history` + dashboard strip `dashboard_home` | `balance.ts` | Use `atTimestamp` for history chart; `accountType` CASH vs HOLDING |
| Ledger query | `Transaction.getAllTransactions`, `getTransactionByID` | `transaction_ledger`, `custom_reports_builder`, `detailed_audit_log` | `transactions.ts`, `audit.ts` | Filters `types/statuses/channelCategories/created/updated` power report builder `lib/report-options.ts` |
| Revenue analytics | Derived from `Transaction` types | `dashboard_home` chart | `transactions.ts` | No separate API — derive from ledger |

### D. Customers & Refunds

| Capability | SDK | Screens | Store | Notes |
|------------|-----|---------|-------|-------|
| Customer directory | `Customer.createCustomer`, `getCustomerByReferenceID`, `updateCustomer` | `customer_directory` | `customers.ts` | `referenceId` = your ID; `updateCustomer` enables edit flow |
| Refunds | `Refund.createRefund`, `getAllRefunds`, `cancelRefund` | `transaction_ledger/[id]` timeline | `transactions.ts` (embedded) | No dedicated screen — add Refund action on transaction detail |

### E. Webhooks & Platform

| Capability | SDK / Model | Screens | Store | Notes |
|------------|-------------|---------|-------|-------|
| Inbound callbacks | Typed `InvoiceCallback`, `PaymentCallback`, `RefundCallback` (`INTEGRATION.md:287-290`) — parse only | `webhook_logs`, `system_health_monitoring_desktop` | `webhooks.ts` | Verify `x-callback-token` (`route.ts:22`), persist before 200, dedupe by `eventId` |
| Sub-merchant | `forUserId` on all methods | `sub_merchant_onboarding_checklist_desktop` | `onboarding.ts` | Partial — full onboarding is Platform REST API, not in v7 (`INTEGRATION.md:339`) |

---

## 3. What CANNOT Be Done via xendit-node v7 (Dashboard-only)

From `INTEGRATION.md:312-325` — do not invent SDK calls for these:

- `api_key_management` — API keys Dashboard-only
- `team_permissions` / `team_permissions_desktop` — RBAC Dashboard-only
- `fraud_prevention_blocklist` / `fraud_prevention_desktop` — fraud rules Dashboard-only (app owns its own `blocklist.ts` but not Xendit rules)
- `risk_velocity_limits_desktop` — Dashboard-only
- `merchant_profile_settings_desktop` — Dashboard-only
- `notification_preferences_desktop` — Dashboard-only
- `identity_verification_kyc` — KYC not in v7 SDK product list
- `support_documentation_hub_desktop` — static content
- Full sub-merchant account provisioning — Platform API, not `xendit-node` v7

Handling: keep mock UI with "Configure in Xendit Dashboard" affordance; never fabricate `xenditClient.Fraud.*`.

---

## 4. Security & Reliability Checklist

- `XENDIT_SECRET_KEY` server-only via `lib/xendit.ts:10` (`server-only` + `env` Zod) — never import in Client Component (`docs/ARCHITECTURE.md:26`).
- Webhook: verify `x-callback-token` (`route.ts:22`), fail 401/500 before parsing, persist `REJECTED` row.
- Idempotency: `createPayout` requires `idempotencyKey` (`payout/apis/Payout.d.ts:20`), `createRefund`/`createCustomer`/`createPaymentRequest` strongly recommended — use stable key `DISB-<referenceId>` or `nanoid`.
- `forUserId` only with authenticated tenant context (`docs/adr/0004-auth-clerk-vs-betterauth.md:19`, `INTEGRATION.md:369`).
- Never log full card/bank numbers; Xendit returns masked.

---

## 5. Recommended BFF Layout (when wiring live)

```
backend-or-app-router/
├── lib/xendit.ts              # client + sub-clients (exists)
├── server/dal/xendit.ts       # DAL wrappers with Zod + authz
├── app/api/
│   ├── balance/route.ts       # GET → Balance.getBalance
│   ├── transactions/route.ts  # GET → Transaction.getAllTransactions
│   ├── invoices/route.ts      # GET/POST → Invoice.*
│   ├── payouts/route.ts       # POST → Payout.createPayout (idempotent)
│   └── webhooks/xendit/route.ts # exists, add ledger update in processWebhookAsync
└── server/data/*.ts           # add live branch: if isXenditConfigured() → SDK else mock
```

---

## 6. How to Use This Prompt (for the assigned coding agent)

1. Read §0 pre-reads fully. Do not assume — grep/codegraph first.
2. Fill §2 mapping table for the specific screen you touch; cite `file:line`.
3. Implement behind `isXenditConfigured()` gate so dev without key still works (mock fallback).
4. Add Zod validation, DAL authz, idempotency, and audit log.
5. Run §7 Missing Audit (5 iterations) before opening PR.
6. Update `INTEGRATION.md` and `PROGRESS.md` if you discover a new mapping or gap.

---

## 7. Missing Audit — 5 Iterative Repeats (MANDATORY)

> **Contract:** Before claiming done, run **5 full iterations** of the same audit suite. Each iteration re-runs **identical queries** — only fixes change. Results go to `docs/audit/xendit-mapping-audit.md` as 5 sections (`## Iteration 1` … `## Iteration 5`). Contract is **≥5**, not exactly 5 — if Iteration 5 still has missing, continue.

### Audit Suite (run identically every iteration)

```bash
# SDK surface
grep -h "Promise<" apps/web/node_modules/xendit-node/*/apis/*.d.ts | wc -l   # expect 36
cat apps/web/node_modules/xendit-node/index.d.ts  # 8 clients
# Screen coverage
grep -c "screens/" SCREENS.md          # expect 33
grep -c "screens" PROGRESS.md          # cross-check
# Store parity
ls apps/web/src/server/data/*.ts
grep -R "from \"xendit-node\"" apps/web/src --include="*.ts" --include="*.tsx"  # expect only lib/xendit.ts
# Security / affordance
grep -R "forUserId" --include="*.ts" --include="*.md" | head -n 20
grep -R 'href="#"' apps/web/src --include="*.tsx"   # expect 0 (comment only at support/page.tsx:1 is OK)
cat apps/web/src/app/api/webhooks/xendit/route.ts | grep -n "x-callback-token"
```

### Per-Iteration Report Template (copy into audit file)

```md
## Iteration N — YYYY-MM-DD HH:mm +07:00
- Queries run: (list commands + codegraph_explore if available)
- Evidence:
  - SDK: 36 methods / 8 clients verified at `index.d.ts:1`, `Balance.d.ts:14`, ...
  - Screens: 33 counted at `SCREENS.md:7`
  - Stores: 12 files at `server/data/*.ts`
  - Client leak: 1 file (`lib/xendit.ts:3`) — PASS
  - Dead affordance: 0 `href="#"` — PASS
  - Webhook verify: `route.ts:22` — PASS
- Missing Table:
  | # | Missing Item | Location | Severity | Status |
  |---|---|---|---|---|
  | 1 | ... | ... | HIGH/MED/LOW | OPEN/FIXED |
- Verdict: MISSING_COUNT = X → (fix applied / PASS)
- Fix diff: (link to prompt diff or "none")
```

### Severity

- **HIGH:** SDK method exists but not in prompt §1 or screen claim is false (e.g., `PaymentMethod` omitted).
- **MED:** Store param not validated or `forUserId` without authz.
- **LOW:** Doc link drift (e.g., `INTEGRATION.md` line number shifted).

### Pass Criteria

- Iteration 5 `MISSING_COUNT = 0` OR all remaining rows are `ACCEPTED GAPS` with citation to `INTEGRATION.md:312-325` or SDK not in v7.
- `pnpm typecheck` and `pnpm lint` pass.
- No `xendit-node` import outside `lib/xendit.ts`.

---

## 8. Verification Commands (run before PR)

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint .
grep -R "from \"xendit-node\"" apps/web/src --include="*.ts" --include="*.tsx"
# → must be exactly 1: apps/web/src/lib/xendit.ts:3
```

---

*Generated: 2026-09-03. SDK: xendit-node@7.0.0. Source: INTEGRATION.md + node_modules/xendit-node apis. Prompt version: 1.0.*
