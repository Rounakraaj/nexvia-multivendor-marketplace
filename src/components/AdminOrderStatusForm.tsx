"use client";

import { useActionState, useEffect } from "react";
import { updateOrderStatus, type AdminActionState } from "@/app/admin/actions";
import { showToast } from "@/lib/toast";

export default function AdminOrderStatusForm({ orderId, status }: { orderId: string; status: string }) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(updateOrderStatus, {});
  useEffect(() => {
    if (state.success) showToast(state.success);
    if (state.error) showToast(state.error, "error");
  }, [state]);
  const choices = status === "PAID" ? [["SHIPPED", "Shipped"], ["CANCELLED", "Cancelled"]] :
    status === "SHIPPED" ? [["DELIVERED", "Delivered"], ["CANCELLED", "Cancelled"]] :
    status === "PENDING" ? [["CANCELLED", "Cancelled"]] : status === "DELIVERED" ? [["DELIVERED", "Delivered"]] : [];
  if (!choices.length) return <span className="text-sm text-[var(--muted)]">No actions</span>;
  return <form action={action} className="flex min-w-48 flex-col gap-2">
    <input type="hidden" name="orderId" value={orderId} />
    <div className="flex items-center gap-2"><select name="status" aria-label="Change order status" className="field min-h-11 py-1 text-sm" defaultValue={choices[0][0]}>{choices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <button className="btn btn-secondary btn-sm" disabled={pending}>{pending ? "Working…" : "Save"}</button></div>
    {state.error && <span role="alert" className="text-xs text-[var(--danger)]">{state.error}</span>}
    {state.success && <span role="status" className="text-xs text-[var(--lime)]">{state.success}</span>}
  </form>;
}
