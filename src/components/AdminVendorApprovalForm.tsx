"use client";

import { useActionState, useEffect } from "react";
import { setVendorApproval, type AdminActionState } from "@/app/admin/actions";
import { showToast } from "@/lib/toast";

export default function AdminVendorApprovalForm({ vendorId, approved }: { vendorId: string; approved: boolean }) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(setVendorApproval, {});
  useEffect(() => {
    if (state.success) showToast(state.success);
    if (state.error) showToast(state.error, "error");
  }, [state]);
  return <form action={action} className="flex flex-col items-end gap-1">
    <input type="hidden" name="vendorId" value={vendorId} />
    <input type="hidden" name="approved" value={String(!approved)} />
    <button className={`btn btn-sm ${approved ? "btn-secondary" : "btn-primary"}`} disabled={pending}>{pending ? "Working…" : approved ? "Suspend" : "Approve"}</button>
    {state.error && <span role="alert" className="text-right text-xs text-[var(--danger)]">{state.error}</span>}
    {state.success && <span role="status" className="text-right text-xs text-[var(--lime)]">{state.success}</span>}
  </form>;
}
