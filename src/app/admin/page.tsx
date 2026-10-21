import { db } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import AdminVendorApprovalForm from "@/components/AdminVendorApprovalForm";

export default async function AdminHome() {
  const [users, products, vendors] = await Promise.all([
    db.user.count(),
    db.product.count(),
    db.vendor.findMany({ include: { user: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const pending = vendors.filter((v) => !v.approved).length;

  const stats: [string, number][] = [
    ["Users", users],
    ["Vendors", vendors.length],
    ["Awaiting approval", pending],
    ["Products listed", products],
  ];

  return (
    <>
      <PageHeader title="Vendor approvals" description="Review new shops before they list products." />

      <section aria-labelledby="approval-heading">
      <h2 id="approval-heading" className="sr-only">Vendors waiting for approval</h2>
      <div className="panel overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Shop</th><th>Owner</th><th>Joined</th><th className="text-right">Action</th></tr></thead>
          <tbody>
            {vendors.filter((v) => !v.approved).length === 0 && <tr><td colSpan={4} className="py-10 text-center text-[var(--muted)]">No vendors are waiting. <a href="#all-vendors" className="tap-target inline-flex items-center underline underline-offset-4 hover:text-[var(--text)]">Review all vendors</a></td></tr>}
            {vendors.filter((v) => !v.approved).map((v) => <tr key={v.id}>
              <td className="font-semibold">{v.shopName}</td><td>{v.user.email}</td><td>{v.createdAt.toLocaleDateString("en-IN")}</td>
              <td className="text-right"><AdminVendorApprovalForm vendorId={v.id} approved={false} /></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      </section>

      <section aria-labelledby="platform-overview" className="mt-10">
      <h2 id="platform-overview" className="mb-4 text-xl font-bold">Platform overview</h2>
      <div className="panel grid divide-y divide-[var(--line)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="p-5">
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="nums mt-2 text-3xl font-extrabold">{value}</p>
          </div>
        ))}
      </div>
      </section>
      <h2 id="all-vendors" className="mb-4 mt-10 text-xl font-bold">All vendors</h2>
      <div className="panel overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Shop</th>
              <th>Owner</th>
              <th>Joined</th>
              <th>Status</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-[var(--muted)]">
                  No vendors yet. New shops appear here for approval.
                </td>
              </tr>
            )}
            {vendors.map((v) => (
              <tr key={v.id}>
                <td className="font-semibold">{v.shopName}</td>
                <td>{v.user.email}</td>
                <td>{v.createdAt.toLocaleDateString("en-IN")}</td>
                <td>
                  <span className={`badge ${v.approved ? "badge-ok" : "badge-warn"}`}>
                    {v.approved ? "Approved" : "Pending"}
                  </span>
                </td>
                <td className="text-right">
                  {v.approved ? <AdminVendorApprovalForm vendorId={v.id} approved /> : <span className="text-sm text-[var(--muted)]">Waiting in queue</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
