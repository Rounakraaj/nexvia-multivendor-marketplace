"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";

export default function CartLink() {
  const { count } = useCart();
  return (
    <Link href="/cart" className="btn btn-secondary btn-sm" aria-label={`Cart, ${count} items`}>
      Cart
      {count > 0 && (
        <span className="rounded-full bg-[var(--lime)] px-2 py-0.5 text-xs font-bold text-black">{count}</span>
      )}
    </Link>
  );
}
