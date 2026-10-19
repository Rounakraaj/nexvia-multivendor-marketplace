"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<"CUSTOMER" | "VENDOR">("CUSTOMER");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: f.get("name"),
        email: f.get("email"),
        password: f.get("password"),
        role,
        shopName: role === "VENDOR" ? f.get("shopName") : undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong");
      return;
    }
    router.push("/login");
  }

  const input =
    "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-950 via-indigo-800 to-indigo-600 p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-500">Nexvia Marketplace</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Create your account</h1>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          {(["CUSTOMER", "VENDOR"] as const).map((r) => (
            <button key={r} type="button" onClick={() => setRole(r)}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                role === r ? "bg-white text-indigo-700 shadow" : "text-slate-500"
              }`}>
              {r === "CUSTOMER" ? "I want to buy" : "I want to sell"}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input name="name" required minLength={2} placeholder="Full name" className={input} />
          <input name="email" type="email" required placeholder="Email" className={input} />
          <input name="password" type="password" required minLength={8} placeholder="Password (min 8 characters)" className={input} />
          {role === "VENDOR" && (
            <input name="shopName" required minLength={2} placeholder="Shop name" className={input} />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={loading}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60">
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-indigo-600 hover:underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
