"use client";

import { useFormStatus } from "react-dom";

export default function PendingSubmitButton({ label, className = "" }: { label: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{pending ? "Working..." : label}</button>;
}
