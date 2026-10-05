"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <main className="relative min-h-screen grid place-items-center px-6 brand-gradient">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.55),rgba(0,0,0,0.85))]" />
      <div className="relative w-full max-w-md rounded-modal border border-white/15 bg-[#0b0f14]/95 p-6 sm:p-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/5 backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/admin/logos/mca-icon.svg" alt="MCA Solutions" className="h-9 w-9 rounded-lg" />
          <h1 className="font-heading text-2xl font-semibold">MCA Admin</h1>
        </div>
        <p className="text-sm text-[var(--muted)] mb-6">
          Endast inbjudna medlemmar. Logga in med din e-post.
        </p>
        <form onSubmit={handleSignIn} className="space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-[var(--muted)]">E-post</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-btn bg-black/40 border border-white/10 px-3 py-2 ring-focus"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-[var(--muted)]">Lösenord</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-btn bg-black/40 border border-white/10 px-3 py-2 ring-focus"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-btn bg-[var(--triad-teal)] text-black font-medium py-2.5 hover:brightness-110 disabled:opacity-50"
          >
            {loading ? "Loggar in…" : "Logga in"}
          </button>
        </form>
        {msg && <p className="mt-4 text-sm text-rose-300">{msg}</p>}
      </div>
    </main>
  );
}
