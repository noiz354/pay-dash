import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { SettingsNav } from "@/components/settings/settings-nav";
import { NotificationPreferencesForm } from "@/components/settings/notification-preferences-form";
import { getNotificationSettings } from "@/server/data/settings";

export const metadata: Metadata = {
  title: "Notifications · Settings",
  description: "Choose how and when the platform contacts you.",
};

export default async function NotificationsPage() {
  const settings = await getNotificationSettings();

  return (
    <main className="mx-auto w-full max-w-container-max p-gutter space-y-6 bg-[var(--surface-canvas)]">
      <div className="mb-2">
        <nav aria-label="Breadcrumb" className="body-sm mb-2 flex items-center gap-2 text-[var(--on-surface-variant)]">
          <Link href="/settings" className="transition-colors hover:text-[var(--primary)]">
            Settings
          </Link>
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
            chevron_right
          </span>
          <span className="text-[var(--on-surface)]">Notifications</span>
        </nav>
        <h1 className="headline-xl text-[var(--on-surface)]">Notification Preferences</h1>
        <p className="body-md text-[var(--on-surface-variant)] mt-2 max-w-2xl">
          Manage how and when you receive alerts for system events, transactions, and account activities.
          Changes save the moment you make them.
        </p>
      </div>

      <SettingsNav />

      <NotificationPreferencesForm
        channels={settings.channels}
        topics={settings.topics}
        updatedAt={settings.updatedAt}
      />
    </main>
  );
}
