import { db } from "@/lib/db";
import SignOutButton from "@/components/SignOutButton";
import { setVendorApproval } from "./actions";

export default async function AdminHome() {
  const [users, vendors] = await Promise.all([
    db.user.count(),
    db.vendor.findMany({ include: { user: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const pending = vendors.filter((v) => !v.approved).length;

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-500">Admin panel</p>
          <h1 className="text-3xl font-bold text-slate-900">Platform overview</h1>
        </div>
        <SignOutButton />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-indigo-50 p-6">
          <p className="text-sm text-indigo-600">Total users</p>
          <p className="text-4xl font-bold text-indigo-900">{users}</p>
        </div>
        <div className="rounded-2xl bg-emerald-50 p-6">
          <p className="text-sm text-emerald-600">Vendors</p>
          <p className="text-4xl font-bold text-emerald-900">{vendors.length}</p>
        </div>
        <div className="rounded-2xl bg-amber-50 p-6">
          <p className="text-sm text-amber-600">Awaiting approval</p>
          <p className="text-4xl font-bold text-amber-900">{pending}</p>
        </div>
      </div>

      <h2 className="mt-10 text-xl font-bold text-slate-900">Vendors</h2>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3">Shop</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No vendors yet.</td></tr>
            )}
            {vendors.map((v) => (
              <tr key={v.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">{v.shopName}</td>
                <td className="px-4 py-3 text-slate-600">{v.user.email}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${v.approved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {v.approved ? "Approved" : "Pending"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={setVendorApproval}>
                    <input type="hidden" name="vendorId" value={v.id} />
                    <input type="hidden" name="approved" value={String(!v.approved)} />
                    <button className={`rounded-lg px-4 py-2 text-xs font-semibold text-white ${v.approved ? "bg-slate-500 hover:bg-slate-600" : "bg-indigo-600 hover:bg-indigo-700"}`}>
                      {v.approved ? "Suspend" : "Approve"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
