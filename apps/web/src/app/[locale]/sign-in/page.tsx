"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Reusable sign-in — Better Auth emailAndPassword (#103), shadcn input/label (#85)
export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? "Sign in failed");
    } else {
      router.push(redirect);
    }
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md items-center p-gutter">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="headline-xl">Sign in — Kinetic Ledger</CardTitle>
          <p className="body-sm text-[var(--on-surface-variant)]">Use your Better Auth account (TEST MODE)</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-[var(--error)]">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary)]/90 disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <p className="body-sm text-center">
              No account? <a href="sign-up" className="text-[var(--primary)] underline">Sign up</a>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
