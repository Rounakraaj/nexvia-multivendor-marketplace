import PageHeader from "@/components/PageHeader";
import AdminCouponForm from "@/components/AdminCouponForm";
import CouponActiveForm from "@/components/CouponActiveForm";
import { db } from "@/lib/db";
import { listCoupons } from "@/lib/marketplace-data";
import { formatPrice } from "@/lib/format";

export default async function AdminCouponsPage() {
  const [coupons, vendors] = await Promise.all([
    listCoupons(),
    db.vendor.findMany({ where: { approved: true }, select: { id: true, shopName: true }, orderBy: { shopName: "asc" } }),
  ]);
  return <>
    <PageHeader title="Coupons" description="Create offers and choose who funds each discount." />
    <AdminCouponForm vendors={vendors} />
    <h2 className="mb-4 mt-8 text-xl font-bold">Existing coupons</h2>
    {coupons === null ? <div className="panel p-5 text-sm text-[var(--muted)]">MongoDB is unavailable. Coupon records cannot be loaded.</div> :
      <div className="panel overflow-x-auto"><table className="tbl min-w-[900px]"><thead><tr><th>Code</th><th>Offer</th><th>Funding</th><th>Usage</th><th>Dates</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {coupons.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-sm text-[var(--muted)]">No coupons created yet.</td></tr>}
        {coupons.map((coupon) => <tr key={coupon._id}><td className="font-semibold">{coupon.code}</td><td>{coupon.discountType === "PERCENT" ? `${coupon.value}%${coupon.maxDiscountPaise ? ` (up to ${formatPrice(coupon.maxDiscountPaise / 100)})` : ""}` : formatPrice(coupon.value / 100)}<span className="block text-xs text-[var(--muted)]">Minimum {formatPrice(coupon.minimumOrderPaise / 100)}</span></td><td>{coupon.funding}{coupon.vendorId ? <span className="block text-xs text-[var(--muted)]">{vendors.find((vendor) => vendor.id === coupon.vendorId)?.shopName ?? "Shop"}</span> : ""}</td><td>{coupon.usedCount} used · {coupon.reservedCount} reserved / {coupon.usageLimit}</td><td className="text-xs">{coupon.startsAt?.toLocaleDateString("en-IN") ?? "Now"} – {coupon.endsAt?.toLocaleDateString("en-IN") ?? "No end"}</td><td>{coupon.active ? "Active" : "Inactive"}</td><td><CouponActiveForm id={coupon._id} active={coupon.active} /></td></tr>)}
      </tbody></table></div>}
  </>;
}
