export default function LoadingSkeleton({ rows = 5, columns = 4, title = "Loading content" }: { rows?: number; columns?: number; title?: string }) {
  return <div role="status" aria-label={title} className="space-y-5">
    <span className="sr-only">{title}</span>
    <div className="h-8 w-48 rounded-lg bg-[var(--surface-2)]" />
    <div className="panel overflow-hidden p-4">
      <div className="grid gap-3 border-b border-[var(--line)] pb-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }, (_, index) => <div key={`head-${index}`} className="h-4 rounded bg-[var(--surface-2)]" />)}
      </div>
      <div className="divide-y divide-[var(--line)]">
        {Array.from({ length: rows }, (_, row) => <div key={row} className="grid gap-3 py-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, column) => <div key={column} className="h-5 rounded bg-[var(--surface-2)]" />)}
        </div>)}
      </div>
    </div>
  </div>;
}
