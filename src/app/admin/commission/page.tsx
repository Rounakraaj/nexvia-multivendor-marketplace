import { requireRole } from "@/lib/guard";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/money";
import { formatPrice } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import CommissionForm from "@/components/CommissionForm";
import SplitBar from "@/components/SplitBar";

const paidStatuses = ["PAID", "PACKED", "SHIPPED", "DELIVERED"] as const;

export default async function AdminCommissionPage() {
  await requireRole(["ADMIN"]);
  const [setting, orderTotals, orderLines, vendors] = await Promise.all([
    db.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1, commissionRate: 10 } }),
    db.order.aggregate({ where: { status: { in: [...paidStatuses] } }, _sum: { total: true }, _count: { id: true } }),
    db.orderItem.findMany({ where: { order: { status: { in: [...paidStatuses] } } }, include: { vendor: { select: { id: true } } } }),
    db.vendor.findMany({ select: { id: true, shopName: true, balance: true }, orderBy: { shopName: "asc" } }),
  ]);
  const perVendor = new Map<string, { sales: number; commission: number; earnings: number }>();
  let commissionTotal = 0;
  for (const line of orderLines) {
    const row = perVendor.get(line.vendorId) ?? { sales: 0, commission: 0, earnings: 0 };
    row.sales += toPaise(line.price.toString()) * line.qty;
    row.commission += toPaise(line.commission.toString());
    row.earnings += toPaise(line.vendorEarning.toString());
    commissionTotal += toPaise(line.commission.toString());
    perVendor.set(line.vendorId, row);
  }
  const grossPaise = orderTotals._sum.total ? toPaise(orderTotals._sum.total.toString()) : 0;
  return <>
    <PageHeader title="Commission" description="Set the platform rate and review marketplace revenue." />
    <CommissionForm rate={setting.commissionRate} />
    <div className="panel mt-6 grid divide-y divide-[var(--line)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <div className="p-5"><p className="text-sm text-[var(--muted)]">Platform revenue</p><p className="nums mt-2 text-2xl font-bold">{formatPrice(commissionTotal / 100)}</p></div>
      <div className="p-5"><p className="text-sm text-[var(--muted)]">Gross sales</p><p className="nums mt-2 text-2xl font-bold">{formatPrice(grossPaise / 100)}</p></div>
      <div className="p-5"><p className="text-sm text-[var(--muted)]">Orders</p><p className="nums mt-2 text-2xl font-bold">{orderTotals._count.id}</p></div>
    </div>
    <section className="panel mt-5 space-y-4 p-5" aria-labelledby="revenue-split-heading">
      <h2 id="revenue-split-heading" className="font-semibold">Revenue split</h2>
      <SplitBar vendor={Math.max(0, grossPaise - commissionTotal)} platform={commissionTotal} label="Marketplace revenue split" />
      <div className="flex flex-wrap justify-between gap-3 text-sm text-[var(--muted)]"><span>Vendor earnings {formatPrice(Math.max(0, grossPaise - commissionTotal) / 100)}</span><span>Platform revenue {formatPrice(commissionTotal / 100)}</span></div>
    </section>
    <h2 className="mb-4 mt-8 text-xl font-bold">Vendor totals</h2>
    <div className="panel overflow-x-auto"><table className="tbl min-w-[720px]"><thead><tr><th>Shop</th><th>Sales</th><th>Commission</th><th>Vendor earnings</th><th>Current balance</th></tr></thead><tbody>
      {vendors.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-[var(--muted)]">No vendors yet.</td></tr>}
      {vendors.map((vendor) => {
        const total = perVendor.get(vendor.id) ?? { sales: 0, commission: 0, earnings: 0 };
        return <tr key={vendor.id}><td className="font-semibold">{vendor.shopName}</td><td className="nums">{formatPrice(total.sales / 100)}</td><td className="nums">{formatPrice(total.commission / 100)}</td><td className="nums">{formatPrice(total.earnings / 100)}</td><td className="nums">{formatPrice(Number(vendor.balance))}</td></tr>;
      })}
    </tbody></table></div>
  </>;
}
