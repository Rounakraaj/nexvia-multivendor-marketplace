import LoadingSkeleton from "@/components/LoadingSkeleton";

export default function Loading() {
  return <><LoadingSkeleton rows={4} columns={4} title="Loading vendor approvals" /><div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="panel h-24" />)}</div></>;
}
