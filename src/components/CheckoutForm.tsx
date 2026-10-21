"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearCart, useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { placeOrder, type CheckoutState } from "@/app/checkout/actions";
import { showToast } from "@/lib/toast";

type RazorpayResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayOptions = {
  key: string; amount: number; currency: string; name: string; description: string; order_id: string;
  handler: (result: RazorpayResult) => void | Promise<void>;
  retry: false;
  modal: { ondismiss: () => void };
  prefill: { name: string };
  theme: { color: string };
};
declare global { interface Window { Razorpay?: new (options: RazorpayOptions) => { open: () => void; on: (event: string, callback: (result: unknown) => void) => void } } }

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) { existing.addEventListener("load", () => resolve(true), { once: true }); existing.addEventListener("error", () => resolve(false), { once: true }); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function CheckoutForm({ customerName, paymentProvider }: { customerName: string; paymentProvider: "simulated" | "razorpay" }) {
  const router = useRouter();
  const { items, total, ready } = useCart();
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, {});
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const activeGatewayOrder = useRef<string | null>(null);
  const cartSignature = items.map((item) => `${item.id}:${item.qty}`).sort().join("|");

  useEffect(() => {
    if (!ready || !cartSignature) return;
    const storageKey = "nexvia-checkout-idempotency";
    let key = "";
    try {
      const previous = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as { signature?: string; key?: string } | null;
      if (previous?.signature === cartSignature && previous.key) {
        key = previous.key;
      } else {
        key = crypto.randomUUID();
        sessionStorage.setItem(storageKey, JSON.stringify({ signature: cartSignature, key }));
      }
    } catch {
      key = crypto.randomUUID();
    }
    const timer = window.setTimeout(() => setIdempotencyKey(key), 0);
    return () => window.clearTimeout(timer);
  }, [cartSignature, ready]);

  useEffect(() => {
    if (!state.orderId) return;
    try { sessionStorage.removeItem("nexvia-checkout-idempotency"); } catch { /* Session storage is optional. */ }
    void clearCart();
    router.push(`/orders/${state.orderId}`);
  }, [router, state.orderId]);

  useEffect(() => {
    const payment = state.payment;
    if (!payment || activeGatewayOrder.current === payment.gatewayOrderId) return;
    let disposed = false;
    activeGatewayOrder.current = payment.gatewayOrderId;
    void (async () => {
      const loaded = await loadRazorpay();
      if (disposed) return;
      if (!loaded || !window.Razorpay) {
        activeGatewayOrder.current = null;
        showToast("Razorpay checkout could not load. Check your connection and try again.", "error");
        return;
      }
      const checkout = new window.Razorpay({
        key: payment.keyId,
        amount: payment.amount,
        currency: payment.currency,
        name: "Nexvia Market",
        description: "Marketplace order",
        order_id: payment.gatewayOrderId,
        retry: false,
        prefill: { name: customerName },
        theme: { color: "#2563eb" },
        handler: async (result) => {
          try {
            const response = await fetch("/api/payments/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result) });
            const body = await response.json() as { orderId?: string; error?: string };
            if (!response.ok || !body.orderId) throw new Error(body.error ?? "Payment could not be verified yet.");
            try { sessionStorage.removeItem("nexvia-checkout-idempotency"); } catch { /* Session storage is optional. */ }
            await clearCart();
            router.push(`/orders/${body.orderId}`);
          } catch (error) {
            activeGatewayOrder.current = null;
            showToast(error instanceof Error ? error.message : "Payment could not be verified. Check your orders in a moment.", "error");
          }
        },
        modal: { ondismiss: () => { activeGatewayOrder.current = null; showToast("Payment was not completed. You can retry checkout.", "error"); } },
      });
      checkout.on("payment.failed", () => showToast("Payment failed. You can retry checkout.", "error"));
      checkout.open();
    })();
    return () => { disposed = true; };
  }, [customerName, router, state.payment]);

  useEffect(() => {
    if (state.error) showToast(state.error, "error");
  }, [state.error]);

  if (!ready) return <div className="panel p-10 text-center text-sm text-[var(--muted)]" role="status">Loading your cart…</div>;

  if (items.length === 0) {
    return <div className="panel p-10 text-center">
      <h2 className="text-lg font-bold">Your cart is empty</h2>
      <p className="mt-2 text-[var(--muted)]">Add a product before checking out.</p>
      <Link href="/" className="btn btn-primary mt-5">Find products</Link>
    </div>;
  }

  return <form action={action} className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
    <div className="panel space-y-5 p-5 sm:p-6">
      <h2 className="text-lg font-bold">Shipping details</h2>
      <input type="hidden" name="items" value={JSON.stringify(items.map(({ id, qty }) => ({ productId: id, qty })))} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div><label className="label" htmlFor="name">Recipient name</label><input className="field" id="name" name="name" required minLength={2} maxLength={100} defaultValue={customerName} autoComplete="name" /></div>
      <div><label className="label" htmlFor="phone">Phone</label><input className="field" id="phone" name="phone" type="tel" required minLength={8} maxLength={20} autoComplete="tel" placeholder="98765 43210" /></div>
      <div><label className="label" htmlFor="addressLine">Address line</label><textarea className="field" id="addressLine" name="addressLine" required minLength={5} maxLength={200} rows={3} autoComplete="street-address" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="city">City</label><input className="field" id="city" name="city" required minLength={2} maxLength={100} autoComplete="address-level2" /></div>
        <div><label className="label" htmlFor="pinCode">PIN code</label><input className="field" id="pinCode" name="pinCode" inputMode="numeric" pattern="[0-9]{6}" required minLength={6} maxLength={6} autoComplete="postal-code" /></div>
      </div>
    </div>
    <aside className="panel h-fit p-5 lg:sticky lg:top-24">
      <h2 className="text-lg font-bold">Order summary</h2>
      <ul className="mt-4 space-y-3 border-b border-[var(--line)] pb-4">
        {items.map((item) => <li key={item.id} className="flex justify-between gap-3 text-sm"><span className="min-w-0 truncate text-[var(--muted)]">{item.title} × {item.qty}</span><span className="nums whitespace-nowrap">{formatPrice(item.price * item.qty)}</span></li>)}
      </ul>
      <p className="mt-4 flex justify-between font-bold"><span>Total</span><span className="nums">{formatPrice(total)}</span></p>
      <p className="mt-3 text-xs text-[var(--muted)]">{paymentProvider === "razorpay" ? "Razorpay test mode is active. Prices and stock are checked again before payment." : "Payment is simulated for this order. Prices and stock are checked again before it is placed."}</p>
      {state.error && <p className="mt-4 rounded-lg border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]" role="alert">{state.error}</p>}
      <button className="btn btn-primary mt-5 w-full" disabled={pending || !idempotencyKey}>{pending ? "Placing order…" : "Pay and place order"}</button>
    </aside>
  </form>;
}
