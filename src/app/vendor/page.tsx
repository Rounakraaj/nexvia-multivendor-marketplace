import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { db } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import { updateVendorProfile } from "@/app/vendor/actions";

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
          <div className="panel overflow-hidden rounded-2xl" style={{ borderColor: vendor.accentColor ?? "#FF2E93" }}>
            <div className="p-6" style={{ background: `linear-gradient(135deg, ${vendor.accentColor ?? "#FF2E93"}22, transparent)` }}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Storefront</p>
              <h2 className="mt-2 text-2xl font-bold">{vendor.brandHero ?? "Curated finds for everyday life"}</h2>
              <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{vendor.tagline ?? "Fresh essentials, honest pricing, and service customers can trust."}</p>
              {vendor.bio && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">{vendor.bio}</p>}
            </div>
          </div>
          <form action={updateVendorProfile} className="panel mt-6 space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold">Customize storefront</h3>
              <span className="badge badge-ok">Brand profile</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-[var(--muted)]">
                Tagline
                <input name="tagline" defaultValue={vendor.tagline ?? ""} maxLength={80} className="field mt-1" placeholder="Fast shipping · locally loved" />
              </label>
              <label className="text-sm text-[var(--muted)]">
                Accent color
                <input name="accentColor" type="color" defaultValue={vendor.accentColor ?? "#FF2E93"} className="field mt-1 h-11 p-1" />
              </label>
              <label className="text-sm text-[var(--muted)] md:col-span-2">
                Brand hero
                <input name="brandHero" defaultValue={vendor.brandHero ?? "Curated finds for everyday life"} maxLength={100} className="field mt-1" placeholder="Curated finds for everyday life" />
              </label>
              <label className="text-sm text-[var(--muted)] md:col-span-2">
                Store bio
                <textarea name="bio" defaultValue={vendor.bio ?? ""} maxLength={240} rows={4} className="field mt-1" placeholder="Tell customers why they should shop from your store." />
              </label>
            </div>
            <button className="btn btn-primary">Save storefront</button>
          </form>
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
