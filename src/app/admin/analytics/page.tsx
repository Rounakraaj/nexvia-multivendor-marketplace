import PageHeader from "@/components/PageHeader";
import SalesChart from "@/components/SalesChart";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { getRecentActivity, getZeroResultQueryStats } from "@/lib/mongo";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { callApiService } from "@/lib/api-service-auth";

const paidStatuses = ["PAID", "PACKED", "SHIPPED", "DELIVERED"] as const;

export default async function AdminAnalyticsPage() {
  const session = await getServerSession(authOptions);
  const serviceRequest = session?.user.role === "ADMIN"
    ? await callApiService("/v1/admin/analytics", { sub: session.user.id, role: session.user.role })
    : null;
  const serviceSnapshot = serviceRequest?.ok
    ? await serviceRequest.json() as { grossSales?: number; paidOrders?: number; commission?: number }
    : null;
  const [orders, lowStock, zeroQueries, activity] = await Promise.all([
    db.order.findMany({
      where: { status: { in: [...paidStatuses] } },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { vendor: { select: { id: true, shopName: true } }, product: { select: { category: true, title: true } } } } },
    }),
    db.product.findMany({ where: { stock: { lte: 5 }, vendor: { approved: true } }, select: { id: true, title: true, stock: true, vendor: { select: { shopName: true } } }, orderBy: { stock: "asc" }, take: 20 }),
    getZeroResultQueryStats(30, 10),
    getRecentActivity(20),
  ]);
  const gross = serviceSnapshot?.grossSales ?? orders.reduce((sum, order) => sum + Number(order.subtotal), 0);
  const commission = serviceSnapshot?.commission ?? orders.reduce((sum, order) => sum + order.items.reduce((inner, item) => inner + Number(item.commission), 0), 0);
  const platformDiscount = orders.filter((order) => order.couponFunding === "PLATFORM").reduce((sum, order) => sum + Number(order.discountTotal), 0);
  const platformRevenue = commission - platformDiscount;
  const takeRate = gross > 0 ? platformRevenue / gross * 100 : 0;
  const today = new Date();
  const daily = Array.from({ length: 14 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (13 - index));
    day.setHours(0, 0, 0, 0);
    return { date: day, label: day.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), value: 0 };
  });
  for (const order of orders) {
    const day = daily.find(({ date }) => date.toDateString() === order.createdAt.toDateString());
    if (day) day.value += Number(order.subtotal);
  }
  const vendors = new Map<string, { id: string; name: string; sales: number; earnings: number; orders: Set<string> }>();
  const categories = new Map<string, { sales: number; quantity: number }>();
  for (const order of orders) for (const item of order.items) {
    const vendor = vendors.get(item.vendorId) ?? { id: item.vendorId, name: item.vendor.shopName, sales: 0, earnings: 0, orders: new Set<string>() };
    vendor.sales += Number(item.price) * item.qty;
    vendor.earnings += Number(item.vendorEarning);
    vendor.orders.add(order.id);
    vendors.set(item.vendorId, vendor);
    const category = categories.get(item.product.category) ?? { sales: 0, quantity: 0 };
    category.sales += Number(item.price) * item.qty;
    category.quantity += item.qty;
    categories.set(item.product.category, category);
  }
  const topVendors = [...vendors.values()].sort((a, b) => b.sales - a.sales).slice(0, 8);
  const topCategories = [...categories.entries()].sort((a, b) => b[1].sales - a[1].sales).slice(0, 8);
  const stats = [["Gross sales", formatPrice(gross)], ["Paid orders", String(serviceSnapshot?.paidOrders ?? orders.length)], ["Net platform revenue", formatPrice(platformRevenue)], ["Take rate", `${takeRate.toFixed(2)}%`]];

  return <>
    <PageHeader title="Marketplace analytics" description="Sales, platform revenue, inventory pressure, and catalog search demand." />
    <div className="panel grid divide-y divide-[var(--line)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">{stats.map(([label, value]) => <div key={label} className="p-5"><p className="text-sm text-[var(--muted)]">{label}</p><p className="nums mt-2 text-2xl font-bold">{value}</p></div>)}</div>
    <div className="mt-5"><SalesChart values={daily} /></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <section className="panel overflow-x-auto p-5"><h2 className="font-semibold">Top vendors</h2><table className="tbl mt-3"><thead><tr><th>Shop</th><th>Orders</th><th>Gross sales</th><th>Seller earnings</th></tr></thead><tbody>{topVendors.length === 0 && <tr><td colSpan={4} className="py-5 text-sm text-[var(--muted)]">No paid sales yet.</td></tr>}{topVendors.map((vendor) => <tr key={vendor.id}><td>{vendor.name}</td><td>{vendor.orders.size}</td><td className="nums">{formatPrice(vendor.sales)}</td><td className="nums">{formatPrice(vendor.earnings)}</td></tr>)}</tbody></table></section>
      <section className="panel overflow-x-auto p-5"><h2 className="font-semibold">Top categories</h2><table className="tbl mt-3"><thead><tr><th>Category</th><th>Units sold</th><th>Gross sales</th></tr></thead><tbody>{topCategories.length === 0 && <tr><td colSpan={3} className="py-5 text-sm text-[var(--muted)]">No paid sales yet.</td></tr>}{topCategories.map(([category, value]) => <tr key={category}><td>{category}</td><td>{value.quantity}</td><td className="nums">{formatPrice(value.sales)}</td></tr>)}</tbody></table></section>
      <section className="panel overflow-x-auto p-5"><h2 className="font-semibold">Low stock · 5 or fewer</h2><table className="tbl mt-3"><thead><tr><th>Product</th><th>Shop</th><th>Stock</th></tr></thead><tbody>{lowStock.length === 0 && <tr><td colSpan={3} className="py-5 text-sm text-[var(--muted)]">No low stock products.</td></tr>}{lowStock.map((product) => <tr key={product.id}><td>{product.title}</td><td>{product.vendor.shopName}</td><td className="nums">{product.stock}</td></tr>)}</tbody></table></section>
      <section className="panel p-5"><h2 className="font-semibold">Zero-result searches · 30 days</h2>{zeroQueries.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No search analytics available, or MongoDB has no events.</p> : <ul className="mt-3 divide-y divide-[var(--line)]">{zeroQueries.map((entry) => <li key={entry.query} className="flex justify-between gap-4 py-2 text-sm"><span>{entry.query}</span><span className="nums text-[var(--muted)]">{entry.count}</span></li>)}</ul>}</section>
      <section className="panel p-5 lg:col-span-2"><h2 className="font-semibold">Recent activity</h2>{activity === null ? <p className="mt-3 text-sm text-[var(--muted)]">Activity history is unavailable because MongoDB could not be reached.</p> : activity.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No activity recorded yet.</p> : <ul className="mt-3 divide-y divide-[var(--line)]">{activity.map((entry) => <li key={String(entry._id)} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{entry.action} · {entry.targetType}{entry.targetId ? ` ${entry.targetId}` : ""}</span><time className="text-xs text-[var(--muted)]">{entry.createdAt.toLocaleString("en-IN")}</time></li>)}</ul>}</section>
    </div>
  </>;
}
