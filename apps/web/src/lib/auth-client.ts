"use client";

import { createAuthClient } from "better-auth/react";

// Reusable client — for useSession, signIn, signOut in Client Components
// Only set an explicit baseURL when provided; otherwise Better Auth uses the
// current origin (avoids falling back to localhost in production).
const baseURL = process.env.NEXT_PUBLIC_APP_URL;

export const authClient = createAuthClient(baseURL ? { baseURL } : {});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
