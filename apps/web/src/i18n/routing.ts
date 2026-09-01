import { defineRouting } from "next-intl/routing";

// Reusable i18n routing — NEXTJS #161 next-intl, ADR-0002, PHASE0_PLAN T7
export const routing = defineRouting({
  locales: ["en", "id"],
  defaultLocale: "id",
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];
