"use client";

import { useEffect, useRef } from "react";

export default function SearchForm({ compact = false }: { compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isEditing = target?.isContentEditable || target?.matches("input, textarea, select");
      if (event.key === "/" && !isEditing) {
        event.preventDefault();
        input.current?.focus();
      }
      if (event.key === "Escape") {
        const searchInput = target instanceof HTMLInputElement && target.type === "search" ? target : input.current;
        if (searchInput?.value) {
          event.preventDefault();
          searchInput.value = "";
          searchInput.form?.requestSubmit();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form action="/" className={compact ? "relative w-full" : "relative mx-auto mt-8 flex w-full max-w-2xl"}>
      <input ref={input} name="q" type="search" placeholder="Search products" aria-label="Search products" className="field pr-12" />
      {!compact && <button className="btn btn-primary ml-2">Search</button>}
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)]">/</kbd>
    </form>
  );
}
