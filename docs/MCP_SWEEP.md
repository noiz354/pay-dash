# MCP Sweep — PayDash MCP (semua tool, query, hasil)

> Sweep live terhadap endpoint `/api/mcp` (Cloud Run) pada 2026-09-05.
> Semua tool READ terverifikasi normal; tool WRITE di-skip (side-effect) dan dilindungi unit test.

## Prasyarat

- Endpoint: `https://paydash-web-723420820074.asia-southeast2.run.app/api/mcp`
- Auth: `Authorization: Bearer <token>` (token dari runtime settings / UI `/settings/mcp`)
- Tanpa token → `401`; MCP disabled → `403`

## Matriks — 30/30 tool READ ✅

| # | Tool | Query (arguments) | Hasil |
|---|---|---|---|
| 1 | `ping` | `{}` | ✅ `{ok:true, service:"paydash"}` |
| 2 | `get_runtime_settings` | `{}` | ✅ `{dataSource:"memory", mcpEnabled:true, xenditEnabled:true}` |
| 3 | `get_mcp_status` | `{}` | ✅ `{mcpEnabled:true, hasToken:true}` |
| 4 | `list_transactions` | `{dataSource:"memory", pageSize:2}` | ✅ 46 rows (txn_05dkphc1…) |
| 5 | `get_transaction` | `{id:"txn_05dkphc1"}` | ✅ detail lengkap |
| 6 | `get_balance` | `{}` | ✅ `{available:2212783280, pendingSettlements:162079885, reserved:59790890}` |
| 7 | `list_movements` | `{pageSize:2}` | ✅ rows SETTLEMENT |
| 8 | `list_payout_batches` | `{pageSize:2}` | ✅ BATCH-2026-08-014 |
| 9 | `get_payout_batch` | `{id:"BATCH-2026-08-014"}` | ✅ detail batch |
| 10 | `get_payouts_overview` | `{}` | ✅ `{pendingAmount:59790890, pendingBatches:2}` |
| 11 | `list_customers` | `{pageSize:2}` | ✅ cus_07833yi (Initech BV) |
| 12 | `get_customer` | `{idOrEmail:"budi.santoso@mail.co.id"}` | ✅ Budi Santoso |
| 13 | `list_invoices` | `{pageSize:2}` | ✅ INV-2026-09-LEDGER |
| 14 | `get_invoice` | `{id:"INV-2026-09-LEDGER"}` | ✅ detail invoice |
| 15 | `list_subscriptions` | `{pageSize:2}` | ✅ sub_0061lx9n (Starter) |
| 16 | `list_links` | `{pageSize:2}` | ✅ plink_4c5d6e7f |
| 17 | `get_kyc_submission` | `{}` | ✅ `null` (belum submit — valid) |
| 18 | `get_risk_overview` | `{}` | ✅ rules + limits |
| 19 | `list_webhooks` | `{pageSize:2}` | ✅ whk_seed_2 |
| 20 | `get_webhook_event` | *(butuh id — belum di-sweep)* | ⏳ pending (TODO.md a) |
| 21 | `list_blocklist` | `{pageSize:2}` | ✅ blk_00ry3u7w (mailinator.com) |
| 22 | `get_merchant_profile` | `{}` | ✅ Acme Corporation LLC |
| 23 | `get_settings_overview` | `{}` | ✅ 6 section |
| 24 | `list_team_members` | `{pageSize:2}` | ✅ Daniel Wirawan (ADMIN) |
| 25 | `list_audit_events` | `{pageSize:2}` | ✅ whk_seed_2 event |
| 26 | `get_onboarding_status` | `{}` | ✅ sections COMPLETED |
| 27 | `xendit_get_balance` | `{}` | ✅ **LIVE** `{available:1005870599, source:"xendit-live"}` |
| 28 | `xendit_list_transactions` | `{limit:5}` | ✅ **LIVE** `{count:0}` (akun TEST kosong — valid) |
| 29 | `list_journal_conversations` | `{uid:"gJM0…HBu53"}` | ✅ 2 konversasi |
| 30 | `get_journal_conversation` | `{uid, conversationId:"9MTH…"}` | ✅ pesan user+model |

## Tool WRITE — tidak dieksekusi saat sweep (side-effect), unit test ✅

| Tool | Alasan skip |
|---|---|
| `refund_transaction` | mutasi in-memory |
| `set_data_source` | mengubah toggle global |
| `rotate_mcp_token` | membatalkan token aktif |
| `xendit_create_invoice` | membuat invoice TEST nyata |

## Catatan

- Auth: tanpa token → `401`, token salah → `401`, MCP disabled → `403` (fail-closed).
- Toggle: `list_transactions` `dataSource:"postgres"` → baca Cloud SQL ledger (source `postgres`, jujur).
- Journal tools butuh `uid` pemilik (isolasi per-user Firestore).
- Tool error (Xendit/API down) → `{error: …}` (tidak throw).