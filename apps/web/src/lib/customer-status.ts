// Client-safe customer status vocabulary.
// Kept out of `server/data/customers.ts` (which imports "server-only") so client
// components can render status menus and pills without pulling the data layer
// into the browser bundle. The data module re-exports these names unchanged.
export const CUSTOMER_STATUSES = ["ACTIVE", "REVIEW", "BLOCKED", "NEW"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
