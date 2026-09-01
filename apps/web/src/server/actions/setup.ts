"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SETUP_STEPS, type SetupStepId } from "@/lib/setup-steps";

// Onboarding checklist state. Persisted in a cookie so the flow is completable
// without an auth/DB round-trip; swap the read/write pair for a `merchant.setup`
// column when the backend lands.

const COOKIE = "kl.setup";
const DEFAULT_DONE: SetupStepId[] = ["business", "bank"];

export async function getCompletedSteps(): Promise<SetupStepId[]> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return DEFAULT_DONE;
  const ids = raw.split(",").filter(Boolean);
  return SETUP_STEPS.map((s) => s.id).filter((id) => ids.includes(id));
}

export async function toggleSetupStepAction(formData: FormData) {
  const id = String(formData.get("stepId") ?? "") as SetupStepId;
  if (!SETUP_STEPS.some((s) => s.id === id)) return;
  const current = new Set(await getCompletedSteps());
  if (current.has(id)) current.delete(id);
  else current.add(id);
  const jar = await cookies();
  jar.set(COOKIE, Array.from(current).join(","), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/[locale]/dashboard", "page");
}
