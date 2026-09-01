import * as React from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// Deterministic avatar palette. The prototype hard-coded one colour per row;
// this derives the same look for any customer so new rows never render blank.
const PALETTES = [
  "bg-[var(--primary-container)] text-[var(--on-primary-container)]",
  "bg-[var(--secondary-container)] text-[var(--on-secondary-container)]",
  "bg-[var(--tertiary-fixed)] text-[var(--on-tertiary-fixed)]",
];

export function paletteFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

export function CustomerAvatar({
  name,
  initials,
  seed,
  className,
}: {
  name: string;
  initials: string;
  seed: string;
  className?: string;
}) {
  return (
    <Avatar className={cn("h-8 w-8 shrink-0 rounded", className)}>
      <AvatarFallback aria-label={name} className={cn("rounded text-xs font-semibold", paletteFor(seed))}>
        {initials || "?"}
      </AvatarFallback>
    </Avatar>
  );
}
