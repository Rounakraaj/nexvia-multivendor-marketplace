import { requireRole } from "@/lib/guard";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import AdminOrderStatusForm from "@/components/AdminOrderStatusForm";
import Link from "next/link";
import OrderTimeline from "@/components/OrderTimeline";

const badgeClass: Record<string, string> = { PAID: "badge-ok", PACKED: "badge-warn", SHIPPED: "badge-warn", DELIVERED: "badge-ok", CANCELLED: "badge-bad", PENDING: "badge-warn" };

export default async function AdminOrdersPage() {
  await requireRole(["ADMIN"]);
  const orders = await db.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { customer: { select: { name: true, email: true } }, _count: { select: { items: true } }, statusHistory: { orderBy: { createdAt: "asc" }, include: { changedBy: { select: { name: true } } } } },
  });
  return <>
    <PageHeader title="Orders" description="Review purchases and update delivery status." />
    <div className="panel overflow-x-auto"><table className="tbl min-w-[1050px]"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th><th>History</th><th>Update status</th></tr></thead><tbody>
      {orders.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-[var(--muted)]">No orders have been placed yet. <Link href="/" className="tap-target inline-flex items-center underline underline-offset-4 hover:text-[var(--text)]">View the storefront</Link></td></tr>}
      {orders.map((order) => <tr key={order.id}><td className="text-xs">#{order.id.slice(-8)}</td><td><span className="block font-semibold">{order.customer.name}</span><span className="text-xs text-[var(--muted)]">{order.customer.email}</span></td><td>{order._count.items}</td><td className="nums">{formatPrice(Number(order.total))}</td><td><span className={`badge ${badgeClass[order.status]}`}>{order.status.toLowerCase()}</span></td><td>{order.createdAt.toLocaleDateString("en-IN")}</td><td><details><summary className="tap-target cursor-pointer text-xs">Timeline</summary><div className="min-w-52 py-2"><OrderTimeline events={order.statusHistory} /></div></details></td><td><AdminOrderStatusForm orderId={order.id} status={order.status} /></td></tr>)}
    </tbody></table></div>
  </>;
}
