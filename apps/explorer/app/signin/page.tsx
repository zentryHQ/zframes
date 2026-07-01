"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/app/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res =
      mode === "up"
        ? await authClient.signUp.email({
            email,
            password,
            name: name || email.split("@")[0],
          })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message || "Something went wrong");
      return;
    }
    router.push("/mine");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-2xl font-bold text-white">
        {mode === "up" ? "Create an account" : "Sign in"}
      </h1>
      <p className="mt-1 mb-6 text-sm text-white/50">
        You only need an account to <strong>publish</strong> or save dashboards —
        browsing, preview, and tinker stay open.
      </p>

      <form onSubmit={submit} className="space-y-3">
        {mode === "up" && (
          <input
            className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30"
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30"
          type="password"
          required
          minLength={8}
          placeholder="Password (8+ chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-3 py-2 text-sm font-medium text-indigo-100 transition-colors hover:bg-indigo-500/25 disabled:opacity-50"
        >
          {busy ? "…" : mode === "up" ? "Create account" : "Sign in"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "up" ? "in" : "up");
          setError(null);
        }}
        className="mt-4 text-sm text-white/50 hover:text-white/80"
      >
        {mode === "up" ? "Have an account? Sign in" : "New here? Create an account"}
      </button>

      <p className="mt-6 text-xs text-white/30">
        GitHub &amp; Google sign-in enable automatically in production once their
        credentials are configured.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/" className="text-white/40 hover:text-white/70">
          ← Back to gallery
        </Link>
      </p>
    </main>
  );
}
