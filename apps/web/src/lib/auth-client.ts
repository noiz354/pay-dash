"use client";

import { createAuthClient } from "better-auth/react";

// Reusable client — for useSession, signIn, signOut in Client Components
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
