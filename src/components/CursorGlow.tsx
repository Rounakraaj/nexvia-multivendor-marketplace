"use client";

import { useEffect, useRef } from "react";

export default function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = ref.current;
    if (!el || !fine || calm) return;

    el.style.display = "block";
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `translate3d(${e.clientX - 260}px, ${e.clientY - 260}px, 0)`;
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        display: "none",
        position: "fixed",
        top: 0,
        left: 0,
        width: 520,
        height: 520,
        borderRadius: "50%",
        pointerEvents: "none",
        zIndex: -1,
        background: "radial-gradient(circle, rgba(255,46,147,0.10), transparent 65%)",
      }}
    />
  );
}
