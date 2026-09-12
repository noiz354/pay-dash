import type { Page } from "@playwright/test";
import { waitForLoadingComplete } from "../test-utils";

// Shared helpers for the Wave 4 critical gates. The dev server seeds a
// deterministic in-memory ledger, and the gates *mutate* it (refund requests,
// retries) — so row selection is always dynamic: walk the filtered ledger,
// open details, and take the first row whose UI state matches what the gate
// needs. Workers run sequentially (see playwright.config.ts) so these picks
// stay deterministic across the suite.

/** Every transaction id linked from the current ledger page (deduped, in order). */
export async function ledgerRowIds(page: Page): Promise<string[]> {
  const hrefs = await page.$$eval('a[href*="/transactions/txn_"]', (anchors) =>
    anchors.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""),
  );
  return [...new Set(hrefs.map((h) => h.split("/").pop()!).filter(Boolean))];
}

/**
 * Walk the ledger (optionally pre-filtered via `query`), opening detail pages
 * until one satisfies `ready`, and return its id. Throws after `max` rows —
 * a gate that cannot find its fixture is a setup error, not a silent skip.
 */
export async function findTransaction(
  page: Page,
  ready: (page: Page) => Promise<boolean>,
  query = "",
  max = 12,
): Promise<string> {
  await page.goto(`/en/transactions${query}`);
  await waitForLoadingComplete(page);
  const ids = await ledgerRowIds(page);
  for (const id of ids.slice(0, max)) {
    await page.goto(`/en/transactions/${id}`);
    await waitForLoadingComplete(page);
    if (await ready(page)) return id;
  }
  throw new Error(`No transaction matched the gate fixture within ${max} rows (query: "${query}").`);
}

/** Wait for a sonner toast containing `text` (toasts are the action feedback). */
export async function expectToast(page: Page, text: string | RegExp, timeout = 25_000): Promise<void> {
  await page
    .locator("[data-sonner-toast]")
    .filter({ hasText: text })
    .first()
    .waitFor({ state: "visible", timeout });
}
