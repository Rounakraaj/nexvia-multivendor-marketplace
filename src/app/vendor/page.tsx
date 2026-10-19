import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { db } from "@/lib/db";
import SignOutButton from "@/components/SignOutButton";

export default async function VendorHome() {
  const session = await requireRole(["VENDOR"]);
  const vendor = await db.vendor.findUnique({ where: { userId: session.user.id } });

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-500">Vendor dashboard</p>
          <h1 className="text-3xl font-bold text-slate-900">{vendor?.shopName}</h1>
        </div>
        <SignOutButton />
      </div>
      {vendor?.approved ? (
        <div className="mt-8 flex items-center justify-between rounded-2xl bg-emerald-50 p-6 text-emerald-800">
          <span>Your shop is approved. You can manage your products.</span>
          <Link href="/vendor/products" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            Manage products
          </Link>
        </div>
      ) : (
        <div className="mt-8 rounded-2xl bg-amber-50 p-6 text-amber-800">
          Your shop is waiting for admin approval. You can add products once approved.
        </div>
      )}
    </main>
  );
}
