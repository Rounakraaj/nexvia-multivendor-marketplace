"use client";

import { useEffect, useState } from "react";
import type { ToastDetail } from "@/lib/toast";

type Toast = ToastDetail & { id: number };

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    let sequence = 0;
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastDetail>).detail;
      if (!detail?.message) return;
      const id = ++sequence;
      setToasts((current) => [...current, { ...detail, id }]);
      window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
    };
    window.addEventListener("nexvia:toast", onToast);
    return () => window.removeEventListener("nexvia:toast", onToast);
  }, []);

  return <>
    {children}
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[100] mx-auto flex max-w-sm flex-col gap-2" aria-live="polite">
      {toasts.map((toast) => <div key={toast.id} role="status" className={`pointer-events-auto flex items-center justify-between gap-4 rounded-[10px] border bg-[var(--surface-1)] px-4 py-3 text-sm ${toast.kind === "error" ? "border-[var(--danger)] text-[var(--danger)]" : "border-[var(--line)] text-[var(--text)]"}`}>
        <span>{toast.message}</span>
        <button type="button" aria-label="Dismiss notification" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} className="tap-target inline-flex shrink-0 items-center justify-center px-2">Dismiss</button>
      </div>)}
    </div>
  </>;
}
