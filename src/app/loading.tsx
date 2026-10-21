import LoadingSkeleton from "@/components/LoadingSkeleton";

export default function Loading() {
  return <main className="mx-auto min-h-[60vh] max-w-4xl px-5 py-10"><div className="mb-8 space-y-3"><div className="h-10 w-72 rounded bg-[var(--surface-2)]" /><div className="h-5 w-56 rounded bg-[var(--surface-1)]" /></div><LoadingSkeleton rows={6} columns={3} title="Loading products" /></main>;
}
