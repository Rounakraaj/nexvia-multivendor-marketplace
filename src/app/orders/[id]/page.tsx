import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { toPaise } from "@/lib/money";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SplitBar from "@/components/SplitBar";

const badgeClass: Record<string, string> = { PAID: "badge-ok", SHIPPED: "badge-warn", DELIVERED: "badge-ok", CANCELLED: "badge-bad", PENDING: "badge-warn" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["CUSTOMER"]);
  const { id } = await params;
  const order = await db.order.findFirst({
    where: { id, customerId: session.user.id },
    include: { items: { include: { product: { select: { title: true } }, vendor: { select: { shopName: true } } } } },
  });
  if (!order) notFound();
  const commission = order.items.reduce((sum, item) => sum + toPaise(item.commission.toString()), 0);
  const earnings = order.items.reduce((sum, item) => sum + toPaise(item.vendorEarning.toString()), 0);
  return <>
    <SiteHeader />
    <main className="mx-auto min-h-[60vh] max-w-3xl px-5 py-10">
      <Link href="/orders" className="tap-target inline-flex items-center text-sm text-[var(--muted)] hover:text-[var(--text)]">Back to orders</Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-3xl font-extrabold">Order details</h1><p className="mt-2 text-sm text-[var(--muted)]">Placed {order.createdAt.toLocaleString("en-IN")}</p></div>
        <span className={`badge ${badgeClass[order.status]}`}>{order.status.toLowerCase()}</span>
      </div>
      <ul className="panel mt-6 divide-y divide-[var(--line)]">
        {order.items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><p className="font-semibold">{item.product.title}</p><p className="text-sm text-[var(--muted)]">{item.vendor.shopName} · {item.qty} × {formatPrice(Number(item.price))}</p></div>
          <p className="nums font-semibold">{formatPrice(Number(item.price) * item.qty)}</p>
        </li>)}
      </ul>
      <section className="panel mt-6 space-y-4 p-5">
        <div className="flex justify-between"><span className="text-[var(--muted)]">Total</span><span className="nums font-bold">{formatPrice(Number(order.total))}</span></div>
        <h2 className="font-semibold">Order split</h2>
        <SplitBar vendor={earnings} platform={commission} />
        <div className="flex justify-between gap-3 text-sm text-[var(--muted)]"><span>Seller earnings {formatPrice(earnings / 100)}</span><span>Platform commission {formatPrice(commission / 100)}</span></div>
      </section>
      {order.shippingAddress && <section className="panel mt-6 p-5"><h2 className="font-semibold">Shipping to</h2><p className="mt-2">{order.shippingName}</p><p className="text-sm text-[var(--muted)]">{order.shippingPhone}</p><p className="text-sm text-[var(--muted)]">{order.shippingAddress}</p></section>}
    </main>
    <SiteFooter />
  </>;
}
