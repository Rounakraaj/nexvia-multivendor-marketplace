"use client";

import { useActionState, useEffect } from "react";
import { createCoupon, type AdminActionState } from "@/app/admin/actions";
import { showToast } from "@/lib/toast";

export default function AdminCouponForm({ vendors }: { vendors: { id: string; shopName: string }[] }) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(createCoupon, {});
  useEffect(() => {
    if (state.success) showToast(state.success);
    if (state.error) showToast(state.error, "error");
  }, [state]);
  return <form action={action} className="panel grid gap-4 p-5 sm:grid-cols-2">
    <div><label className="label" htmlFor="coupon-code">Code</label><input className="field uppercase" id="coupon-code" name="code" minLength={3} maxLength={24} required placeholder="WELCOME10" /></div>
    <div><label className="label" htmlFor="coupon-funding">Funding</label><select className="field" id="coupon-funding" name="funding" defaultValue="PLATFORM"><option value="PLATFORM">Platform-funded</option><option value="VENDOR">Vendor-funded</option></select></div>
    <div><label className="label" htmlFor="coupon-vendor">Sponsor shop (vendor-funded only)</label><select className="field" id="coupon-vendor" name="vendorId" defaultValue=""><option value="">Choose a shop</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.shopName}</option>)}</select></div>
    <div><label className="label" htmlFor="coupon-type">Discount type</label><select className="field" id="coupon-type" name="discountType" defaultValue="PERCENT"><option value="PERCENT">Percentage</option><option value="FIXED">Fixed rupee amount</option></select></div>
    <div><label className="label" htmlFor="coupon-value">Discount value</label><input className="field" id="coupon-value" name="value" type="number" min="0.01" step="0.01" required placeholder="10" /></div>
    <div><label className="label" htmlFor="coupon-max">Maximum discount (₹, optional)</label><input className="field" id="coupon-max" name="maxDiscount" type="number" min="0.01" step="0.01" /></div>
    <div><label className="label" htmlFor="coupon-minimum">Minimum eligible order (₹)</label><input className="field" id="coupon-minimum" name="minimumOrder" type="number" min="0" step="0.01" defaultValue="0" required /></div>
    <div><label className="label" htmlFor="coupon-limit">Use limit</label><input className="field" id="coupon-limit" name="usageLimit" type="number" min="1" max="1000000" defaultValue="100" required /></div>
    <div><label className="label" htmlFor="coupon-start">Starts at (optional)</label><input className="field" id="coupon-start" name="startsAt" type="datetime-local" /></div>
    <div><label className="label" htmlFor="coupon-end">Ends at (optional)</label><input className="field" id="coupon-end" name="endsAt" type="datetime-local" /></div>
    <p className="text-sm text-[var(--muted)] sm:col-span-2">Vendor-funded discounts reduce that shop’s earnings. Platform-funded discounts reduce platform revenue and leave seller earnings intact.</p>
    {state.error && <p role="alert" className="text-sm text-[var(--danger)] sm:col-span-2">{state.error}</p>}
    <div className="sm:col-span-2"><button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Create coupon"}</button></div>
  </form>;
}
