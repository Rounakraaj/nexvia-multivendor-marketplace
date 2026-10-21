export default function SalesChart({ values }: { values: { label: string; value: number }[] }) {
  const width = 720;
  const height = 190;
  const max = Math.max(1, ...values.map(({ value }) => value));
  const points = values.map(({ value }, index) => `${index * (width / Math.max(values.length - 1, 1))},${height - value / max * (height - 18)}`).join(" ");
  return <div className="panel p-5">
    <h2 className="font-semibold">Daily gross sales · last 14 days</h2>
    {values.some(({ value }) => value > 0) ? <svg className="mt-4 h-48 w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily gross sales chart">
      <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="currentColor" opacity="0.2" />
      <polyline points={points} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((point, index) => <circle key={point.label} cx={index * (width / Math.max(values.length - 1, 1))} cy={height - point.value / max * (height - 18)} r="4" fill="#2563eb"><title>{point.label}: {point.value}</title></circle>)}
    </svg> : <p className="py-12 text-sm text-[var(--muted)]">No paid sales in this period.</p>}
    <div className="flex justify-between text-xs text-[var(--muted)]"><span>{values[0]?.label}</span><span>{values.at(-1)?.label}</span></div>
  </div>;
}
