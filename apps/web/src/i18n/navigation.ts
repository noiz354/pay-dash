import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware navigation — Addy Osmani: shell links stay cached, locale prefix handled at proxy
// Use this Link instead of next/link for all app routes (dashboard, transactions, etc.)
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
