"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signUp.email({ email, password, name });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? "Sign up failed");
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md items-center p-gutter">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="headline-xl">Create account</CardTitle>
          <p className="body-sm text-[var(--on-surface-variant)]">Better Auth — emailAndPassword enabled</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Jane Doe" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-[var(--error)]">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary)]/90 disabled:opacity-50">
              {loading ? "Creating…" : "Sign up"}
            </button>
            <p className="body-sm text-center">
              Already have an account? <a href="sign-in" className="text-[var(--primary)] underline">Sign in</a>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
