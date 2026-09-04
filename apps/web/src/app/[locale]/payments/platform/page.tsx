import type { Metadata } from "next";
import { PlatformSettingsForms } from "@/components/platform/platform-settings-forms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Platform — Connected accounts, KYC, routing",
  description: "Connected accounts (Stripe Connect), KYC verification routing, split/transfer routing.",
};

export default function PlatformPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Platform</h1>
        <p className="text-sm text-[var(--muted)]">
          Connected accounts, KYC verification routing, and split/transfer routing. These run through the
          provider payment-flow once a TEST connection is configured; without one they stay a read-only shell.
        </p>
      </header>
      <PlatformSettingsForms />
    </div>
  );
}
