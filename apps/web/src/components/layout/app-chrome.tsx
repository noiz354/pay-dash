"use client";

import { useEffect, useState } from "react";
import { Sidebar, SIDEBAR_COLLAPSED_KEY } from "./sidebar";
import { BottomNav } from "./bottom-nav";
import type { OrganizationRole } from "@/domain/organization/roles";

export function AppChrome({ children, roles }: { children: React.ReactNode; roles?: OrganizationRole[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (raw !== null) setCollapsed(raw === "1");
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed, hydrated]);

  // Listen to storage changes (e.g., Sidebar toggled if not controlled) — but we control Sidebar now
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SIDEBAR_COLLAPSED_KEY && e.newValue !== null) setCollapsed(e.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar roles={roles} collapsed={collapsed} onCollapsedChange={setCollapsed} />
      <div className="flex min-h-screen flex-1 flex-col transition-all duration-200" style={{ paddingLeft: collapsed ? "72px" : "280px" } as React.CSSProperties}>
        {/* On mobile, no left padding — override via CSS */}
        <style>{`@media (max-width: 767px) { div[style] { padding-left: 0 !important; } }`}</style>
        <div className="flex-1 pb-16 md:pb-0">{children}</div>
        <BottomNav roles={roles} />
      </div>
    </div>
  );
}
