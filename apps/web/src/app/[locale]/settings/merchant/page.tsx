import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { SettingsNav } from "@/components/settings/settings-nav";
import { MerchantProfileForm } from "@/components/settings/merchant-profile-form";
import { getMerchantProfile } from "@/server/data/settings";

export const metadata: Metadata = {
  title: "Merchant Profile · Settings",
  description: "Business identity, contact details and platform branding.",
};

export default async function MerchantProfilePage() {
  const profile = await getMerchantProfile();

  return (
    <main className="flex-1 flex flex-col min-h-screen bg-[var(--surface-canvas)]">
      <div className="flex-1 w-full max-w-5xl mx-auto p-gutter space-y-6 pb-32">
        <nav aria-label="Breadcrumb" className="body-sm flex items-center gap-2 text-[var(--on-surface-variant)]">
          <Link href="/settings" className="transition-colors hover:text-[var(--primary)]">
            Settings
          </Link>
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
            chevron_right
          </span>
          <span className="text-[var(--on-surface)]">Merchant Profile</span>
        </nav>

        <div className="flex flex-col gap-2">
          <h1 className="headline-xl text-[var(--on-surface)]">Merchant Profile</h1>
          <p className="body-md text-[var(--on-surface-variant)]">
            Manage your business identity, contact details, and platform branding preferences.
          </p>
        </div>

        <SettingsNav />

        <MerchantProfileForm profile={profile} />
      </div>
    </main>
  );
}
