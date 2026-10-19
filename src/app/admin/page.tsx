import { db } from "@/lib/db";
import SignOutButton from "@/components/SignOutButton";

export default async function AdminHome() {
  const [users, pending] = await Promise.all([
    db.user.count(),
    db.vendor.count({ where: { approved: false } }),
  ]);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-500">Admin panel</p>
          <h1 className="text-3xl font-bold text-slate-900">Platform overview</h1>
        </div>
        <SignOutButton />
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-indigo-50 p-6">
          <p className="text-sm text-indigo-600">Total users</p>
          <p className="text-4xl font-bold text-indigo-900">{users}</p>
        </div>
        <div className="rounded-2xl bg-amber-50 p-6">
          <p className="text-sm text-amber-600">Vendors awaiting approval</p>
          <p className="text-4xl font-bold text-amber-900">{pending}</p>
        </div>
      </div>
    </main>
  );
}
