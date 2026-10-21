"use client";

import { useActionState, useEffect } from "react";
import { saveCommission, type AdminActionState } from "@/app/admin/actions";
import { showToast } from "@/lib/toast";

export default function CommissionForm({ rate }: { rate: number }) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(saveCommission, {});
  useEffect(() => {
    if (state.success) showToast(state.success);
    if (state.error) showToast(state.error, "error");
  }, [state]);
  return <form action={action} className="panel max-w-xl space-y-5 p-6">
    <div><label className="label" htmlFor="rate">Commission rate (%)</label><input className="field" id="rate" name="rate" type="number" min="0" max="50" step="0.5" required defaultValue={rate} /></div>
    <p className="text-sm text-[var(--muted)]">This rate applies to future orders only. Existing order splits stay the same.</p>
    {state.error && <p role="alert" className="text-sm text-[var(--danger)]">{state.error}</p>}
    {state.success && <p role="status" className="text-sm text-[var(--lime)]">{state.success}</p>}
    <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save rate"}</button>
  </form>;
}
