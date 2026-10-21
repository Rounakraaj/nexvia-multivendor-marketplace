"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import PasswordField from "@/components/PasswordField";
import { showToast } from "@/lib/toast";

const roles = [
  ["CUSTOMER", "Buy", "Shop from sellers"],
  ["VENDOR", "Sell", "Open your own shop"],
] as const;

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
    try {
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data.error ?? "Registration failed. Check your details and try again.";
        setError(message);
        showToast(message, "error");
        return;
      }
      router.push("/login");
    } catch {
      const message = "We could not create your account. Check your connection and try again.";
      setError(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="It takes less than a minute."
      footer={
        <p>
          Already registered?{" "}
          <Link href="/login" className="tap-target inline-flex items-center font-semibold underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    >
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Account type">
        {roles.map(([r, t, d]) => (
          <button
            key={r}
            type="button"
            aria-pressed={role === r}
            onClick={() => setRole(r)}
            className={`min-h-11 rounded-lg border p-3 text-left ${
              role === r ? "border-[var(--lime)] bg-[var(--surface-1)]" : "border-[var(--line)] hover:border-[var(--text)]"
            }`}
          >
            <span className="block text-sm font-semibold">{t}</span>
            <span className="block text-xs text-[var(--muted)]">{d}</span>
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        <div>
          <label htmlFor="name" className="label">Full name</label>
          <input id="name" name="name" required minLength={2} autoComplete="name" className="field" />
        </div>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="field" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <PasswordField id="password" name="password" label="Password" minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
        </div>
        {role === "VENDOR" && (
          <div>
            <label htmlFor="shopName" className="label">Shop name</label>
            <input id="shopName" name="shopName" required minLength={2} className="field" />
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-[var(--danger)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium text-[var(--danger)]">
            {error}
          </p>
        )}
        <button disabled={loading} className="btn btn-primary w-full py-3">
          {loading ? "Working..." : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
