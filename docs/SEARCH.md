# Search

Ledger/report search for `apps/web`. Ponytail: start with Postgres, upgrade only when measured.

## Ladder

1. **Postgres full-text first** — `tsvector`/`tsquery` + GIN index on `transaction`, `customer`, `invoice` tables. Covers 90% of `transaction_ledger` / `custom_reports_builder` / `detailed_audit_log`.
2. **Upgrade when:** prefix typo-tolerance, faceting, or >100ms p95 on 1M rows.
3. **Then:** Meilisearch or Typesense (self-host), Algolia only if managed required.

## Postgres Recipe

```sql
-- migration
ALTER TABLE "Transaction" ADD COLUMN search_vector tsvector;
CREATE INDEX transaction_search_idx ON "Transaction" USING GIN (search_vector);
-- keep in sync via trigger or Prisma middleware
```

Query via Prisma `queryRaw` with `plainto_tsquery('english', $query)`.

## Env

`SEARCH_PROVIDER=postgres|meilisearch|typesense`. Default `postgres`; no extra infra until switched.

## Verification

Seed 10k rows, `EXPLAIN ANALYZE` search <100ms p95. E2E: type in ledger search → debounced `fetch` → filtered rows.
