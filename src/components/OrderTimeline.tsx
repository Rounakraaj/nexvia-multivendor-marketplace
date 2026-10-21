import type { OrderStatus } from "@/lib/order-lifecycle";

type Event = { id: string; status: OrderStatus; note: string | null; createdAt: Date; changedBy?: { name: string } | null };

const label: Record<OrderStatus, string> = {
  PENDING: "Awaiting payment", PAID: "Paid", PACKED: "Packed", SHIPPED: "Shipped",
  DELIVERED: "Delivered", CANCELLED: "Cancelled",
};

export default function OrderTimeline({ events }: { events: Event[] }) {
  if (events.length === 0) return <p className="text-xs text-[var(--muted)]">No status history recorded.</p>;
  return <ol className="space-y-2">
    {events.map((event) => <li key={event.id} className="flex gap-2 text-xs">
      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--blue)]" />
      <span><strong>{label[event.status]}</strong><span className="text-[var(--muted)]"> · {event.createdAt.toLocaleString("en-IN")}{event.changedBy ? ` · ${event.changedBy.name}` : ""}</span>{event.note && <span className="block text-[var(--muted)]">{event.note}</span>}</span>
    </li>)}
  </ol>;
}
