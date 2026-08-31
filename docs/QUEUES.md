# Queues & Jobs

Reliability for `xendit-node` webhooks, payouts, reconciliation (`INTEGRATION.md:285-303` + `PROGRESS.md: Phase 2`).

## Ladder

1. **No queue initially** — `POST /api/webhooks/xendit` verifies `x-callback-token`, dedupes by `event_id` in Postgres, processes inline, returns 200 fast. Sufficient for low volume.
2. **Add queue when:** retries, scheduled reconciliation, or >1s processing.
3. **Then:** pick one — Inngest or Trigger.dev (managed, Vercel-friendly) or BullMQ + Redis/Upstash (self-owned). Don't run two.

## Design

```
Xendit -> POST /api/webhooks/xendit -> verify -> dedupe (Prisma unique) -> enqueue -> worker -> idempotent ledger update
Payout -> Server Action -> Prisma + idempotencyKey (nanoid) -> xenditClient.Payout.createPayout -> audit log
Reconciliation (cron) -> compare Postgres ledger vs Xendit Transaction.list -> alert on drift
```

Worker location: `apps/web/src/server/jobs/` (or `apps/web/src/inngest/` if Inngest).

## Env

`REDIS_URL` (Upstash) when queue added; `INNGEST_EVENT_KEY` if Inngest. Until then, no Redis required.

## Verification

Replay webhook twice → second is deduped (409 or 200 no-op). Kill worker, retry → recovers. `idempotencyKey` replay → no duplicate payout (`INTEGRATION.md:222`).
