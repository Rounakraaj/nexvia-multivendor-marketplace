"use client";

import { useState } from "react";

type Props = { id: string; name: string; label: string; autoComplete: string; placeholder?: string; minLength?: number };

export default function PasswordField({ id, name, label, autoComplete, placeholder, minLength }: Props) {
  const [visible, setVisible] = useState(false);
  return <div>
    <label htmlFor={id} className="label">{label}</label>
    <div className="relative">
      <input id={id} name={name} type={visible ? "text" : "password"} required minLength={minLength} autoComplete={autoComplete} placeholder={placeholder} className="field pr-24" />
      <button type="button" aria-controls={id} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible((value) => !value)} className="tap-target absolute right-1 top-1/2 -translate-y-1/2 rounded-lg px-3 text-sm text-[var(--muted)] hover:text-[var(--text)]">
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  </div>;
}
