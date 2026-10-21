"use client";

import { useActionState, useEffect } from "react";
import { markOrderShipped, type ShipmentState } from "@/app/vendor/actions";
import { showToast } from "@/lib/toast";

export default function VendorOrderShipForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState<ShipmentState, FormData>(markOrderShipped, {});
  useEffect(() => {
    if (state.success) showToast(state.success);
    if (state.error) showToast(state.error, "error");
  }, [state]);
  return <form action={action} className="flex flex-col items-end gap-1">
    <input type="hidden" name="orderId" value={orderId} />
    <button className="btn btn-secondary btn-sm" disabled={pending}>{pending ? "Working…" : "Mark shipped"}</button>
    {state.error && <span role="alert" className="max-w-48 text-right text-xs text-[var(--danger)]">{state.error}</span>}
    {state.success && <span role="status" className="text-xs text-[var(--lime)]">{state.success}</span>}
  </form>;
}
