import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-950 via-indigo-800 to-indigo-600 p-6 text-center text-white">
      <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">Nexvia Marketplace</p>
      <h1 className="mt-3 text-5xl font-bold">Shop from many vendors.</h1>
      <p className="mt-3 max-w-md text-indigo-100">Browse, buy and sell on one platform. The storefront is coming soon.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/login" className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-indigo-700">Sign in</Link>
        <Link href="/register" className="rounded-xl border border-white/40 px-6 py-3 text-sm font-semibold">Create account</Link>
      </div>
    </main>
  );
}
