import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { db } from "@/lib/db";
import PageHeader from "@/components/PageHeader";

export default async function VendorHome() {
  const session = await requireRole(["VENDOR"]);
  const vendor = await db.vendor.findUnique({ where: { userId: session.user.id }, include: { products: { select: { stock: true } } } });
  if (!vendor) return null;
  const orderCount = await db.order.count({ where: { items: { some: { vendorId: vendor.id } } } });

  const low = vendor.products.filter((p) => p.stock <= 5).length;

  const stats: [string, number | string][] = [
    ["Balance", `Rs. ${Number(vendor.balance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
    ["Orders", orderCount],
    ["Products", vendor.products.length],
    ["Low stock (5 or fewer)", low],
  ];

  return (
    <>
      <PageHeader
        title={vendor.shopName}
        description="Your shop at a glance."
        action={
          vendor.approved ? (
            <Link href="/vendor/products/new" className="btn btn-primary">
              Add product
            </Link>
          ) : undefined
        }
      />

      {vendor.approved ? (
        <>
          <div className="panel grid divide-y divide-[var(--line)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label} className="p-5">
                <p className="text-sm text-[var(--muted)]">{label}</p>
                <p className="nums mt-2 text-2xl font-extrabold">{value}</p>
              </div>
            ))}
          </div>
          <Link href="/vendor/earnings" className="tap-target mt-5 inline-flex items-center text-sm font-semibold text-[var(--muted)] underline underline-offset-4 hover:text-[var(--text)]">View earnings and the 14-day chart</Link>
        </>
      ) : (
        <div className="panel p-6">
          <span className="badge badge-warn">Pending approval</span>
          <h2 className="mt-3 text-lg font-bold">Your shop is being reviewed</h2>
          <p className="mt-1 max-w-lg text-sm text-[var(--muted)]">
            An admin needs to approve your shop before you can list products. This page updates as soon as you are approved.
          </p>
        </div>
      )}
    </>
  );
}
