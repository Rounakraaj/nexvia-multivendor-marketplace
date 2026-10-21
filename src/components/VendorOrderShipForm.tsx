"use client";

import { useActionState, useEffect } from "react";
import { advanceVendorOrder, type ShipmentState } from "@/app/vendor/actions";
import { showToast } from "@/lib/toast";

export default function VendorOrderShipForm({ orderId, status }: { orderId: string; status: "PAID" | "PACKED" }) {
  const [state, action, pending] = useActionState<ShipmentState, FormData>(advanceVendorOrder, {});
  useEffect(() => {
    if (state.success) showToast(state.success);
    if (state.error) showToast(state.error, "error");
  }, [state]);
  return <form action={action} className="flex flex-col items-end gap-1">
    <input type="hidden" name="orderId" value={orderId} />
    <input type="hidden" name="status" value={status === "PAID" ? "PACKED" : "SHIPPED"} />
    <button className="btn btn-secondary btn-sm" disabled={pending}>{pending ? "Working…" : status === "PAID" ? "Mark packed" : "Mark shipped"}</button>
    {state.error && <span role="alert" className="max-w-48 text-right text-xs text-[var(--danger)]">{state.error}</span>}
    {state.success && <span role="status" className="text-xs text-[var(--lime)]">{state.success}</span>}
  </form>;
}
