export default function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em]">{title}</h1>
        {description && <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}
