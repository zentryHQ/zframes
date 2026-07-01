"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/app/lib/auth-client";
import { BrandMark } from "@/app/lib/BrandMark";

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

  const inputCls =
    "w-full rounded-lg border border-white/12 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-indigo-400/50 focus:bg-white/[0.05]";

  return (
    <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-md flex-col justify-center px-6 py-16">
      <div className="hairline glass rounded-2xl p-7">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark idKey="signin" className="h-10 w-10" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
            {mode === "up" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            An account is only needed to <strong className="text-white/70">publish</strong> or
            save dashboards — browsing, preview, and tinker stay open.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "up" && (
            <input
              className={inputCls}
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            className={inputCls}
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={inputCls}
            type="password"
            required
            minLength={8}
            placeholder="Password (8+ chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="glow-brand w-full rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-3 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
          >
            {busy ? "…" : mode === "up" ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="mt-5 border-t border-white/[0.07] pt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setMode(mode === "up" ? "in" : "up");
              setError(null);
            }}
            className="text-sm text-white/55 transition-colors hover:text-white"
          >
            {mode === "up" ? "Have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
      </div>

      <p className="mt-5 text-center text-xs text-white/30">
        GitHub &amp; Google sign-in enable automatically in production once their
        credentials are configured.
      </p>
      <p className="mt-4 text-center text-sm">
        <Link href="/" className="text-white/40 transition-colors hover:text-white/70">
          ← Back to gallery
        </Link>
      </p>
    </main>
  );
}
