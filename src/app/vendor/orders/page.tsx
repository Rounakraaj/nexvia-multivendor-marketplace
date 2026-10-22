import { requireApprovedVendor } from "@/lib/guard";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import VendorOrderShipForm from "@/components/VendorOrderShipForm";
import Link from "next/link";
import OrderTimeline from "@/components/OrderTimeline";

const badgeClass: Record<string, string> = { PAID: "badge-ok", PACKED: "badge-warn", SHIPPED: "badge-warn", DELIVERED: "badge-ok", CANCELLED: "badge-bad", PENDING: "badge-warn" };

export default async function VendorOrdersPage() {
  const vendor = await requireApprovedVendor();
  const orders = await db.order.findMany({
    where: { items: { some: { vendorId: vendor.id } } },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { name: true } },
      _count: { select: { items: true } },
      statusHistory: { orderBy: { createdAt: "asc" }, include: { changedBy: { select: { name: true } } } },
      items: { where: { vendorId: vendor.id }, include: { product: { select: { title: true } } } },
    },
  });
  return <>
    <PageHeader title="Orders" description="Items customers ordered from your shop." />
    <div className="panel overflow-x-auto">
      <table className="tbl min-w-[900px]"><thead><tr><th>Product</th><th>Qty</th><th>Customer</th><th>Line total</th><th>Commission</th><th>Your earnings</th><th>Status</th><th>Date</th><th>Action</th></tr></thead><tbody>
        {orders.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-[var(--muted)]">No orders yet. <Link href="/vendor/products" className="tap-target inline-flex items-center underline underline-offset-4 hover:text-[var(--text)]">Review your products</Link></td></tr>}
        {orders.flatMap((order) => order.items.map((item, index) => {
          const canShip = (order.status === "PAID" || order.status === "PACKED") && order._count.items === order.items.length;
          return <tr key={item.id}>
            <td className="font-semibold">{item.product.title}</td><td>{item.qty}</td><td>{order.customer.name.split(/\s+/)[0]}</td>
            <td className="nums">{formatPrice(Number(item.price) * item.qty)}</td><td className="nums text-[color:var(--magenta)]">{formatPrice(Number(item.commission))}</td><td className="nums font-semibold text-[color:var(--lime)]">{formatPrice(Number(item.vendorEarning))}</td>
            <td><span className={`badge ${badgeClass[order.status]}`}>{order.status.toLowerCase()}</span></td><td>{order.createdAt.toLocaleDateString("en-IN")}</td>
            <td>{index === 0 && canShip ? <VendorOrderShipForm orderId={order.id} status={order.status as "PAID" | "PACKED"} /> : index === 0 && (order.status === "PAID" || order.status === "PACKED") ? <span className="text-xs text-[var(--muted)]">Other shops have items</span> : ""}{index === 0 && <details className="mt-2"><summary className="tap-target cursor-pointer text-xs">Timeline</summary><div className="min-w-52 py-2"><OrderTimeline events={order.statusHistory} /></div></details>}</td>
          </tr>;
        }))}
      </tbody></table>
    </div>
  </>;
}
