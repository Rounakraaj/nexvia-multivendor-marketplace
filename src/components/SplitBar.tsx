type Props = { vendor: number; platform: number; label?: string };

export default function SplitBar({ vendor, platform, label = "Order split" }: Props) {
  const total = Math.max(0, vendor) + Math.max(0, platform);
  const vendorPercent = total ? (Math.max(0, vendor) / total) * 100 : 0;
  const platformPercent = total ? 100 - vendorPercent : 0;
  return (
    <div className="space-y-2" role="img" aria-label={`${label}: vendor ${vendorPercent.toFixed(0)} percent, platform ${platformPercent.toFixed(0)} percent`}>
      <div className="split-bar" aria-hidden="true">
        <span className="split-bar-vendor" style={{ width: `${vendorPercent}%` }} />
        <span className="split-bar-platform" style={{ width: `${platformPercent}%` }} />
      </div>
      <div className="flex justify-between gap-4 text-xs text-[var(--muted)]">
        <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--lime)]" />Seller</span>
        <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--magenta)]" />Platform</span>
      </div>
    </div>
  );
}
