import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PageHeader from "@/components/PageHeader";

const badgeClass: Record<string, string> = { PAID: "badge-ok", SHIPPED: "badge-warn", DELIVERED: "badge-ok", CANCELLED: "badge-bad", PENDING: "badge-warn" };

export default async function OrdersPage() {
  const session = await requireRole(["CUSTOMER"]);
  const orders = await db.order.findMany({
    where: { customerId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true } } },
  });
  return <>
    <SiteHeader />
    <main className="mx-auto min-h-[60vh] max-w-4xl px-5 py-10">
      <PageHeader title="Your orders" description="Track purchases and review past orders." />
      {orders.length === 0 ? <div className="panel p-8"><h2 className="font-semibold">No orders yet</h2><p className="mt-2 text-sm text-[var(--muted)]">Find something from an independent seller to get started.</p><Link href="/" className="btn btn-primary mt-5">Browse products</Link></div> :
        <div className="panel overflow-x-auto"><table className="tbl"><thead><tr><th>Order</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>
          {orders.map((order) => <tr key={order.id}><td><Link className="tap-target inline-flex items-center font-semibold hover:underline" href={`/orders/${order.id}`}>View order</Link></td><td>{order.createdAt.toLocaleDateString("en-IN")}</td><td>{order._count.items}</td><td className="nums">{formatPrice(Number(order.total))}</td><td><span className={`badge ${badgeClass[order.status]}`}>{order.status.toLowerCase()}</span></td></tr>)}
        </tbody></table></div>}
    </main>
    <SiteFooter />
  </>;
}
