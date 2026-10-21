"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import AuthShell from "@/components/AuthShell";
import PasswordField from "@/components/PasswordField";
import { showToast } from "@/lib/toast";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const f = new FormData(e.currentTarget);
    try {
      const res = await signIn("credentials", {
        email: String(f.get("email")),
        password: String(f.get("password")),
        redirect: false,
      });
      if (res?.error) {
        const message = "The email or password is incorrect. Check both and try again.";
        setError(message);
        showToast(message, "error");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      const message = "We could not sign you in. Check your connection and try again.";
      setError(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Enter your details to continue."
      footer={
        <p>
          New to Nexvia Market?{" "}
          <Link href="/register" className="tap-target inline-flex items-center font-semibold underline underline-offset-4">
            Create an account
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="field" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <PasswordField id="password" name="password" label="Password" autoComplete="current-password" placeholder="Your password" />
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-[var(--danger)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium text-[var(--danger)]">
            {error}
          </p>
        )}
        <button disabled={loading} className="btn btn-primary w-full py-3">
          {loading ? "Working..." : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
