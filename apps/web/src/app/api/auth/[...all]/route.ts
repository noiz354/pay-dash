import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Reusable Better Auth handler — NEXTJS #103, #6 Route Handlers
export const { POST, GET } = toNextJsHandler(auth);
