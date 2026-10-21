"use client";

import Link from "next/link";
import { clearCart, removeItem, setQty, useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import SplitBar from "@/components/SplitBar";

export default function CartView() {
  const { items, total, ready } = useCart();

  if (!ready) return <div className="panel p-10 text-center text-sm text-[var(--muted)]" role="status">Loading your cart…</div>;

  if (items.length === 0) {
    return (
      <div className="panel p-16 text-center">
        <p className="text-lg font-bold">Your cart is empty</p>
        <p className="mt-1 text-sm text-[var(--muted)]">Search for a product and add it here.</p>
        <Link href="/" className="btn btn-primary mt-6">
          Find products
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <ul className="panel divide-y divide-[var(--line)]">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <Link href={`/products/${i.id}`} className="font-semibold hover:underline">{i.title}</Link>
                <p className="text-sm text-[var(--muted)]">{i.shop}</p>
                <button onClick={() => void removeItem(i.id)} className="tap-target mt-1 inline-flex items-center text-sm font-semibold underline underline-offset-4">
                  Remove
                </button>
              </div>
              <div className="flex items-center gap-5">
                <div className="flex items-center rounded-[10px] border border-[var(--line)]">
                  <button onClick={() => void setQty(i.id, i.qty - 1)} aria-label="Decrease quantity" className="h-11 w-11 text-lg hover:bg-[var(--surface-2)]">-</button>
                  <span className="w-8 text-center text-sm font-semibold">{i.qty}</span>
                  <button
                    onClick={() => void setQty(i.id, i.qty + 1)}
                    disabled={i.qty >= i.stock}
                    aria-label="Increase quantity"
                    className="h-11 w-11 text-lg hover:bg-[var(--surface-2)] disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
                <p className="nums w-24 text-right font-bold">{formatPrice(i.price * i.qty)}</p>
              </div>
            </li>
          ))}
        </ul>
        <button onClick={() => void clearCart()} className="tap-target mt-4 inline-flex items-center text-sm text-[var(--muted)] underline underline-offset-4">
          Clear cart
        </button>
      </div>

      <aside className="panel h-fit p-6 lg:sticky lg:top-24">
        <h2 className="text-lg font-bold">Order summary</h2>
        <div className="mt-4 flex justify-between text-sm">
          <span>Subtotal</span>
          <span className="nums">{formatPrice(total)}</span>
        </div>
        <div className="mt-5 rounded-[10px] border border-[var(--line)] p-4">
          <h3 className="mb-3 text-sm font-semibold">Where your money goes</h3>
          <SplitBar vendor={total * 0.9} platform={total * 0.1} />
          <p className="mt-3 text-xs text-[var(--muted)]">Estimated split at the 10% commission rate.</p>
        </div>
        <div className="mt-3 flex justify-between border-t border-[var(--line)] pt-4 text-lg font-extrabold">
          <span>Total</span>
          <span className="nums">{formatPrice(total)}</span>
        </div>
        <Link href="/checkout" className="btn btn-primary mt-6 w-full py-3">
          Proceed to checkout
        </Link>
        <p className="mt-3 text-xs text-[var(--muted)]">Final prices and stock are confirmed at checkout.</p>
      </aside>
    </div>
  );
}
