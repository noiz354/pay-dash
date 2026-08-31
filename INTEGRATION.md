# Xendit Integration Guide (xendit-node)

A comprehensive reference for any coding agent wiring this dashboard's screens to the **official `xendit-node` SDK**. It maps every screen to the correct SDK client/method, provides verified code recipes, and flags the screens that have no public API.

> SDK version referenced: **`xendit-node` 7.0.0** (requires **Node 18+**).

---

## 1. Architecture reality check

This repo is a **static UI prototype monorepo** — every screen is a self-contained `code.html` with Tailwind CDN and hardcoded mock data. There is no runtime, no backend, no data layer.

To integrate with Xendit you must introduce a **server-side layer** that calls `xendit-node` and feeds real data to the UI. Two viable patterns:

| Pattern | When to use | Shape |
| --- | --- | --- |
| **Backend-for-frontend (BFF)** | Recommended | Node/Express (or Next.js API routes / serverless functions) exposes `/api/*` JSON endpoints; the HTML/JS frontend fetches them and replaces mock values. |
| **Server-rendered templates** | Lightweight | Render the existing screens with a template engine, injecting live data before serving. |

The rest of this guide assumes the BFF pattern.

---

## 2. Install & configure

```bash
npm install xendit-node@latest
```

```typescript
// lib/xendit.ts
import { Xendit } from 'xendit-node';

export const xenditClient = new Xendit({
  secretKey: process.env.XENDIT_SECRET_KEY!,
  // Optional: override for a mock server
  // xenditURL: 'https://mock-server.localhost:3000',
});

export const { Balance, Transaction, Invoice, Payout, Customer, PaymentRequest, Refund } = xenditClient;
```

**Environment variables** (never hardcode the secret key):

```bash
XENDIT_SECRET_KEY=xnd_development_xxxxxxxx
XENDIT_WEBHOOK_TOKEN=wh_xxxxxxxx   # for verifying incoming callbacks
```

- Get the key from the Xendit Dashboard: *Settings → Developers → API Keys*.
- The SDK defaults to production `https://api.xendit.co`. There is no separate sandbox URL; use a development key for test mode.

---

## 3. Two instantiation styles (both valid)

The SDK supports destructuring from the top-level client **or** instantiating a sub-client directly. They are functionally identical.

```typescript
import { Xendit, Invoice as InvoiceClient } from 'xendit-node';

const xenditClient = new Xendit({ secretKey: process.env.XENDIT_SECRET_KEY! });
const { Invoice } = xenditClient;                         // style A

const invoiceClient = new InvoiceClient({ secretKey: process.env.XENDIT_SECRET_KEY! }); // style B
```

All request models are imported from **subpath model modules** — this is where the SDK keeps its TypeScript types:

```typescript
import type { Invoice }               from 'xendit-node/invoice/models';
import type { Balance }               from 'xendit-node/balance_and_transaction/models';
import type { TransactionsResponse }  from 'xendit-node/balance_and_transaction/models';
import type { CreatePayoutRequest }   from 'xendit-node/payout/models';
import type { PaymentRequestParameters } from 'xendit-node/payment_request/models';
```

---

## 4. Screen → SDK mapping

### Mobile — Kinetic Enterprise

| Screen | SDK client | Primary methods |
| --- | --- | --- |
| `dashboard_home` | `Balance`, `Transaction` | `getBalance()`, `getAllTransactions()` |
| `api_key_management` | — none | Dashboard-only (see §8) |
| `balance_history` | `Balance` | `getBalance({ accountType, currency })` |
| `custom_reports_builder` | `Transaction` | `getAllTransactions({ ...filters })` |
| `customer_directory` | `Customer` | `getCustomerByReferenceID()`, `createCustomer()`, `getCustomer()` |
| `developer_settings` | — none | Webhooks configured in Dashboard (§7) |
| `fraud_prevention_blocklist` | — none | Dashboard-only |
| `identity_verification_kyc` | — none | Not exposed by v7 SDK |
| `payment_links_invoices` | `Invoice` / `PaymentRequest` | `createInvoice()`, `getInvoices()` / `createPaymentRequest()` |
| `payout_settings` | `Payout` | `getPayoutChannels()` |
| `subscription_management` | `Invoice` | `getInvoices()` with recurring filters |
| `team_permissions` | — none | Dashboard RBAC only |
| `transaction_ledger` | `Transaction` | `getAllTransactions()`, `getTransactionByID()` |
| `webhook_logs` | — none | You *receive* webhooks (§7); no log-fetch API |

### Desktop — Kinetic Ledger

| Screen | SDK client | Primary methods |
| --- | --- | --- |
| `dashboard_home_desktop` | `Balance`, `Transaction` | `getBalance()`, `getAllTransactions()` |
| `balance_history_desktop` | `Balance` | `getBalance()` |
| `billing_invoices_desktop` | `Invoice` | `getInvoices()` |
| `bulk_payouts_desktop` | `Payout` | `createPayout()`, `getPayouts()` |
| `custom_reports_builder_desktop` | `Transaction` | `getAllTransactions()` |
| `customer_directory_desktop` | `Customer` | `getCustomerByReferenceID()`, `createCustomer()` |
| `detailed_audit_log_desktop` | `Transaction` | `getAllTransactions()` + webhook events (§7) |
| `developer_settings_desktop` | — none | Webhook config (§7) |
| `fraud_prevention_desktop` | — none | Dashboard-only |
| `identity_verification_kyc_desktop` | — none | Not exposed by v7 SDK |
| `merchant_profile_settings_desktop` | — none | Dashboard-only |
| `notification_preferences_desktop` | — none | Dashboard-only |
| `risk_velocity_limits_desktop` | — none | Dashboard-only |
| `sub_merchant_onboarding_checklist_desktop` | multi-tenant (`forUserId`) | Platform API — partial via `forUserId` (§9) |
| `subscription_management_desktop` | `Invoice` | `getInvoices()` recurring |
| `support_documentation_hub_desktop` | — none | Static content |
| `system_health_monitoring_desktop` | — none | Operational; webhooks (§7) |
| `team_permissions_desktop` | — none | Dashboard RBAC only |
| `transaction_ledger_desktop` | `Transaction` | `getAllTransactions()`, `getTransactionByID()` |

---

## 5. Verified code recipes

### Balance — `balance_history`, dashboard volume cards

```typescript
import { Balance } from 'xendit-node/balance_and_transaction/models';

const balance: Balance = await xenditClient.Balance.getBalance({
  accountType: 'CASH',        // 'CASH' | 'HOLDING' | 'TAX' (default CASH)
  currency: 'IDR',            // optional
  atTimestamp: new Date(),    // optional: balance at a point in time
});
```

### Transactions — `transaction_ledger`, `custom_reports_builder`, `detailed_audit_log`

```typescript
import { TransactionsResponse } from 'xendit-node/balance_and_transaction/models';

const response: TransactionsResponse = await xenditClient.Transaction.getAllTransactions({
  types: ['PAYMENT', 'DISBURSEMENT'],
  statuses: ['SUCCEEDED', 'PENDING'],
  channelCategories: ['BANK'],
  currency: 'IDR',
  limit: 25,
  afterId: undefined,        // cursor for pagination
  created: {                 // DateRangeFilter
    gte: new Date('2026-08-01T00:00:00Z'),
    lte: new Date('2026-08-29T23:59:59Z'),
  },
});

// Single transaction
const tx = await xenditClient.Transaction.getTransactionByID({ id: 'txn_...' });
```

### Invoices — `payment_links_invoices`, `billing_invoices_desktop`

```typescript
import { CreateInvoiceRequest, Invoice } from 'xendit-node/invoice/models';

const data: CreateInvoiceRequest = {
  amount: 10000,
  invoiceDuration: 172800,
  externalId: 'test1234',       // your reference
  description: 'Test Invoice',
  currency: 'IDR',
  reminderTime: 1,
};

const invoice: Invoice = await xenditClient.Invoice.createInvoice({ data });

const invoices: Invoice[] = await xenditClient.Invoice.getInvoices({
  statuses: ['PAID', 'PENDING'],
  limit: 25,
  createdAfter: new Date('2026-08-01'),
});
```

### Payment Requests (QR / e-wallet / virtual account) — alternative for `payment_links_invoices`

```typescript
import { PaymentRequestParameters, PaymentRequest } from 'xendit-node/payment_request/models';

const data: PaymentRequestParameters = {
  country: 'ID',
  amount: 15000,
  currency: 'IDR',
  referenceId: 'example-ref-1234',
  paymentMethod: {
    type: 'EWALLET',
    reusability: 'ONE_TIME_USE',
    ewallet: { channelCode: 'SHOPEEPAY', channelProperties: { successReturnUrl: 'https://you.com/success' } },
  },
};

const pr: PaymentRequest = await xenditClient.PaymentRequest.createPaymentRequest({ data });
```

### Payouts — `bulk_payouts_desktop`, `payout_settings`

```typescript
import { CreatePayoutRequest, GetPayouts200ResponseDataInner } from 'xendit-node/payout/models';

const data: CreatePayoutRequest = {
  amount: 90000,
  channelProperties: { accountNumber: '000000', accountHolderName: 'John Doe' },
  description: 'Test Bank Payout',
  currency: 'PHP',
  type: 'DIRECT_DISBURSEMENT',
  referenceId: 'DISB-001',
  channelCode: 'PH_BDO',
};

const payout: GetPayouts200ResponseDataInner = await xenditClient.Payout.createPayout({
  idempotencyKey: 'DISB-1234',   // REQUIRED — prevent duplicate payouts
  data,
});

// Available channels (for payout_settings dropdowns)
const channels = await xenditClient.Payout.getPayoutChannels({ currency: 'PHP' });
```

### Customers — `customer_directory`

```typescript
import { Customer } from 'xendit-node/customer/models';

const customer: Customer = await xenditClient.Customer.createCustomer({
  idempotencyKey: 'cust-idem-1',
  data: {
    referenceId: 'cust-001',
    type: 'INDIVIDUAL',
    individualDetail: { givenNames: 'Ahmad', surname: 'Gunawan' },
    email: 'ahmad@example.com',
  },
});

// Look up by your own reference id
const found = await xenditClient.Customer.getCustomerByReferenceID({ referenceId: 'cust-001' });
```

### Refunds — used by transaction/ledger actions

```typescript
import { Refund } from 'xendit-node/refund/models';

const refund: Refund = await xenditClient.Refund.createRefund({
  idempotencyKey: 'rfd-idem-1',
  data: { amount: 10000, referenceId: 'refund-001', reason: 'CANCELLATION' },
});

const all = await xenditClient.Refund.getAllRefunds({ limit: 25 });
```

---

## 6. Idempotency & error handling

- **Idempotency keys** are required/strongly-recommended for money-movement calls (`createPayout`, `createRefund`, `createCustomer`, `createPaymentRequest`). Generate a stable key per logical operation (e.g. `DISB-<referenceId>`) and retry safely on network failure.
- Wrap every call; the SDK throws on non-2xx. Surface Xendit error codes to the UI rather than raw stacks.

```typescript
async function safeCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // err carries Xendit API error code + message; log + map to UI toast
    console.error('Xendit call failed', err);
    throw err;
  }
}
```

---

## 7. Webhooks (callbacks)

The SDK ships typed **callback models** — but you do not instantiate them. You parse the inbound JSON from Xendit:

```typescript
import type { InvoiceCallback }  from 'xendit-node/invoice/models';
import type { PaymentCallback }  from 'xendit-node/payment_request/models';
import type { RefundCallback }   from 'xendit-node/refund/models';

app.post('/webhooks/xendit', (req, res) => {
  // 1. VERIFY: compare req.headers['x-callback-token'] to your XENDIT_WEBHOOK_TOKEN
  // 2. Parse body and handle by event type
  const payload = req.body;         // e.g. event: 'payment.succeeded'
  switch (payload.event) {
    case 'payment.succeeded':  handlePaymentSucceeded(payload as PaymentCallback); break;
    case 'invoice.paid':       handleInvoicePaid(payload as InvoiceCallback); break;
    case 'refund.succeeded':   handleRefundSucceeded(payload as RefundCallback); break;
  }
  res.status(200).send('ok');       // respond fast, non-2xx triggers retries
});
```

- Configure the webhook URL + token in the Xendit Dashboard (*Settings → Developers → Webhooks*).
- **Always** verify the callback token before trusting the payload — this is the fraud/security boundary.
- The `webhook_logs` and `system_health_monitoring` screens should surface these received events + their delivery status (there is no "fetch logs" API — you persist inbound callbacks yourself).

---

## 8. Screens with **no** public SDK equivalent

These are Xendit **Dashboard configuration** features, not REST APIs — they cannot be automated via `xendit-node`:

| Screen | Reality |
| --- | --- |
| `api_key_management` | API keys are managed in the Dashboard only. No SDK method. |
| `team_permissions` / `team_permissions_desktop` | Role-based access control is Dashboard-only. |
| `fraud_prevention_blocklist` / `fraud_prevention_desktop` | Fraud rules are Dashboard/console-only. |
| `risk_velocity_limits_desktop` | Velocity/risk thresholds are Dashboard-only. |
| `merchant_profile_settings_desktop` | Merchant profile is Dashboard-only. |
| `notification_preferences_desktop` | Notification settings are Dashboard-only. |
| `identity_verification_kyc` / `_desktop` | Xendit KYC exists but is **not** in the v7 node SDK product list. |
| `support_documentation_hub_desktop` | Static content; no API. |

**Handling:** For these screens, keep the mock UI but treat it as a read-only reflection of Dashboard state — or leave a clear "configure in Xendit Dashboard" affordance. Do not invent SDK calls that don't exist.

---

## 9. Multi-tenant / sub-merchant onboarding

Most SDK methods accept an optional `forUserId` parameter — this is the **platform/partner** mechanism: act on behalf of a sub-account.

```typescript
const balance = await xenditClient.Balance.getBalance({ forUserId: 'sub-user-id' });
const txs = await xenditClient.Transaction.getAllTransactions({ forUserId: 'sub-user-id' });
```

- `sub_merchant_onboarding_checklist_desktop` maps to this *partially*: you can read/write data for a sub-account via `forUserId`, but **full account creation & document onboarding** is the Xendit **Platform API**, which is **not** exposed by `xendit-node` v7. Use the platform REST API directly (or the Dashboard) for account provisioning.

---

## 10. Recommended project layout (BFF)

```
backend/
├── lib/
│   └── xendit.ts            # client + sub-clients (§2)
├── routes/
│   ├── balance.ts           # GET /api/balance
│   ├── transactions.ts      # GET /api/transactions
│   ├── invoices.ts          # GET/POST /api/invoices
│   ├── payouts.ts           # GET/POST /api/payouts
│   ├── customers.ts         # GET/POST /api/customers
│   └── webhooks.ts          # POST /webhooks/xendit (§7)
├── .env                     # XENDIT_SECRET_KEY, XENDIT_WEBHOOK_TOKEN
└── server.ts
```

Then point each screen's fetch calls at these endpoints and substitute the returned values into the existing Tailwind markup (numeric cells right-aligned in `data-mono`, status badges mapped from Xendit status enums).

---

## 11. Security checklist

- Store `XENDIT_SECRET_KEY` server-side only; never ship it to the browser.
- Verify webhook `x-callback-token` on every inbound callback.
- Use idempotency keys on all money-movement operations.
- Apply `forUserId` only with authenticated, authorized tenant context.
- Never log full card/bank account numbers; Xendit returns masked values.
