import { requireApprovedVendor } from "@/lib/guard";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { toPaise } from "@/lib/money";
import PageHeader from "@/components/PageHeader";
import SplitBar from "@/components/SplitBar";

const paidStatuses = ["PAID", "PACKED", "SHIPPED", "DELIVERED"] as const;

export default async function VendorEarningsPage() {
  const vendor = await requireApprovedVendor();
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 13);
  const lines = await db.orderItem.findMany({
    where: { vendorId: vendor.id, order: { status: { in: [...paidStatuses] } } },
    include: { order: { select: { createdAt: true } } },
  });
  const salesPaise = lines.reduce((sum, item) => sum + toPaise(item.price.toString()) * item.qty, 0);
  const commissionPaise = lines.reduce((sum, item) => sum + toPaise(item.commission.toString()), 0);
  const earningsPaise = lines.reduce((sum, item) => sum + toPaise(item.vendorEarning.toString()), 0);
  const chartItems = lines.filter((item) => item.order.createdAt >= since);
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(since);
    date.setUTCDate(since.getUTCDate() + index);
    return { date, earning: 0, commission: 0 };
  });
  for (const item of chartItems) {
    const key = item.order.createdAt.toISOString().slice(0, 10);
    const day = days.find((entry) => entry.date.toISOString().slice(0, 10) === key);
    if (day) {
      day.earning += toPaise(item.vendorEarning.toString());
      day.commission += toPaise(item.commission.toString());
    }
  }
  const maxTotal = Math.max(1, ...days.map((day) => day.earning + day.commission));
  const chartSummary = days.map((day) => `${day.date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}: seller ${formatPrice(day.earning / 100)}, platform ${formatPrice(day.commission / 100)}`).join("; ");
  return <>
    <PageHeader title="Earnings" description="Sales and commission from completed and active paid orders." />
    <div className="panel grid divide-y divide-[var(--line)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <div className="p-5"><p className="text-sm text-[var(--muted)]">Current balance</p><p className="nums mt-2 text-2xl font-bold">{formatPrice(Number(vendor.balance))}</p></div>
      <div className="p-5"><p className="text-sm text-[var(--muted)]">Lifetime sales</p><p className="nums mt-2 text-2xl font-bold">{formatPrice(salesPaise / 100)}</p></div>
      <div className="p-5"><p className="text-sm text-[var(--muted)]">Total commission</p><p className="nums mt-2 text-2xl font-bold">{formatPrice(commissionPaise / 100)}</p></div>
    </div>
    <section className="panel mt-6 p-5" aria-labelledby="daily-earnings-heading">
      <h2 id="daily-earnings-heading" className="font-bold">Daily earnings</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">The bar colors show your earnings and the platform commission for each day.</p>
      <div className="mt-5 flex flex-wrap items-center gap-5 text-xs text-[var(--muted)]"><span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[var(--lime)]" />Seller earnings</span><span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[var(--magenta)]" />Platform commission</span></div>
      <svg role="img" aria-label={`Daily order split for the last 14 days. ${chartSummary}`} viewBox="0 0 560 150" preserveAspectRatio="none" className="mt-4 h-48 w-full border-b border-[var(--line)]">
        {days.map((day, index) => {
          const limeHeight = (day.earning / maxTotal) * 125;
          const magentaHeight = (day.commission / maxTotal) * 125;
          const x = index * 40 + 10;
          const dateLabel = day.date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
          return <g key={day.date.toISOString()}>
            <title>{`${dateLabel}: seller ${formatPrice(day.earning / 100)}, platform ${formatPrice(day.commission / 100)}`}</title>
            <rect x={x} y={140 - limeHeight} width="22" height={limeHeight} rx="2" fill="var(--lime)" />
            <rect x={x} y={140 - limeHeight - magentaHeight} width="22" height={magentaHeight} rx="2" fill="var(--magenta)" />
          </g>;
        })}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-[var(--muted)]"><span>{days[0].date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}</span><span>{days.at(-1)?.date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}</span></div>
      <p className="sr-only">{chartSummary}</p>
    </section>
    <section className="panel mt-6 space-y-4 p-5" aria-labelledby="earnings-split-heading">
      <h2 id="earnings-split-heading" className="font-semibold">Your lifetime split</h2>
      <SplitBar vendor={earningsPaise} platform={commissionPaise} label="Lifetime sales split" />
      <div className="flex flex-wrap justify-between gap-3 text-sm text-[var(--muted)]"><span className="font-semibold text-[color:var(--lime)]">Seller earnings {formatPrice(earningsPaise / 100)}</span><span className="font-semibold text-[color:var(--magenta)]">Platform commission {formatPrice(commissionPaise / 100)}</span></div>
    </section>
  </>;
}
