import LoadingSkeleton from "@/components/LoadingSkeleton";

export default function Loading() {
  return <><div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="panel h-28 bg-[var(--surface-1)]" />)}</div><LoadingSkeleton title="Loading vendor dashboard" /></>;
}
