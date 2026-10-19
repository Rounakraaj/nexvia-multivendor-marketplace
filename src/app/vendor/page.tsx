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
      <div className={`mt-8 rounded-2xl p-6 ${vendor?.approved ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
        {vendor?.approved
          ? "Your shop is approved. You can start adding products."
          : "Your shop is waiting for admin approval. You can add products once approved."}
      </div>
    </main>
  );
}
