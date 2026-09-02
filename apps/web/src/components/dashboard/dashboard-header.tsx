import { CreateTransactionDialog } from "@/components/transactions/create-transaction-dialog";
import { ExportCsvButton } from "@/components/transactions/export-csv-button";
import { merchantGreeting } from "@/lib/settings-options";
import { getMerchantProfile } from "@/server/data/settings";

// Dashboard header — the greeting comes from the merchant profile
// (ADR-0009), not from a hard-coded person: the data model has no owner
// name field, so the prototype's "Sarah" was fabricated identity data.
export async function DashboardHeader() {
  const profile = await getMerchantProfile();
  const name = merchantGreeting(profile);

  return (
    <section className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-[var(--border-subtle)] pb-4">
      <div>
        <h1 className="headline-xl text-[var(--on-surface)]">Welcome back, {name}</h1>
        <p className="body-md text-[var(--on-surface-variant)] mt-1">
          Here&apos;s what&apos;s happening with your accounts today.
        </p>
      </div>
      <div className="flex gap-2">
        <ExportCsvButton label="Download Report" respectFilters={false} />
        <CreateTransactionDialog />
      </div>
    </section>
  );
}
