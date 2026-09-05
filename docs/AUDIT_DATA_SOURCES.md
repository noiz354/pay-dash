# Audit Sumber Data — Fitur PayDash

> Ringkasan jujur dari modul mana yang benar-benar terhubung ke penyimpanan persisten vs
> yang memakai seam in-memory. Diverifikasi terhadap kode pada 2026-09-05 (build6 live).

## Kesimpulan singkat

- **Benar-benar jalan & data persist:** Better Auth (Postgres via Prisma), health DB, webhook ingress store, dan AI Journal (Firestore + Gemini + Secret Manager).
- **"Berjalan" tapi data in-memory (bukan DB):** seluruh halaman dashboard (transactions, balance, payouts, customers, dst.). Sumbernya seam `globalThis` in-memory, bukan Cloud SQL.
- **Provider live (Xendit/Stripe) belum end-to-end:** butuh `PaymentProviderConnection` ACTIVE di DB; tanpa itu resolver balik `null` dan flow memakai mock/demo.

## Tabel audit

| Fitur | Sumber data | Status |
|---|---|---|
| Better Auth (sign-up / login / session) | Prisma → Cloud SQL | ✅ REAL & persist |
| Health `/api/health` | Prisma → Cloud SQL (`SELECT 1`) | ✅ REAL |
| Webhook ingress (Xendit/Stripe) | Prisma → Cloud SQL (`WebhookDelivery`) | ✅ REAL store (fallback in-memory bila Prisma gagal) |
| AI Journal (chat, konversasi) | Firestore + Gemini API + Secret Manager + Firebase Auth | ✅ REAL & persist |
| Dashboard + semua halaman (transactions, balance, payouts, customers, invoices, subscriptions, links, kyc, risk, webhooks, blocklist, settings, team, audit, onboarding) | In-memory `globalThis` seam (deterministic seed) | ⚠️ Berfungsi visual — data seeded, TIDAK di Postgres, reset cold start |
| Eksekusi provider (Xendit/Stripe live) | butuh `PaymentProviderConnection` ACTIVE di DB | ⚠️ Belum ter-wire → fallback mock/in-memory |

## Bukti dari kode

- Modul data: `src/server/data/*` semuanya memakai seam `globalThis` (contoh `transactions.ts` `seed(46)`,
  `payouts.ts` `__kineticPayoutStore`, dst). Tidak ada yang mengimpor Prisma.
- Lapisan Prisma `src/server/dal/*` (`user.ts`, `ledger.ts`) **tidak diimpor oleh siapa pun** (dead code / production target).
- Webhook store: `buildWebhookDeliveryStore()` → `tryBuildDurableStore()` memakai `PrismaWebhookDeliveryDb` bila client tersedia, fallback `InMemoryWebhookDeliveryStore`.
- Connection resolver: `buildRuntimeConnectionResolver()` → `resolveFirstActive(org)`; tanpa koneksi ACTIVE di DB → `null` → `executeHostedPayment` balik `null` (dev/demo).
- AI Journal repository: `users/{uid}/interactions/{conversationId}` + subkoleksi `messages` (Firestore), mode `AI_JOURNAL_STORAGE_MODE=memory` hanya untuk non-produksi.

## Implikasi untuk demo & submission

- **Untuk demo:** cukup — dashboard penuh (data seeded in-memory), auth jalan, journal jalan (Firestore).
  Narasi submission tetap valid: Cloud Run + Firebase Auth + Firestore + Gemini + Secret Manager semua **nyata**;
  Cloud SQL nyata untuk auth & webhook.
- **Untuk klaim "dashboard terhubung Cloud SQL":** tidak jujur — perlu wiring dashboard ke Prisma (pekerjaan "wave production").

## Rencana tindak lanjut

MCP server (`/api/mcp`) dengan toggle data source `memory|postgres` + wire Xendit, plus UI settings
(`/settings/mcp`). Lihat `docs/DEPLOY_GCP.md` untuk runbook deployment.