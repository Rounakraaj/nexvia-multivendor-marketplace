import Link from "next/link";
import SplitBar from "@/components/SplitBar";

type Props = { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode };

export default function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between border-r border-[var(--line)] bg-[var(--surface-1)] p-12 lg:flex">
        <Link href="/" className="tap-target inline-flex items-center text-xl font-bold tracking-[-0.03em]">Nexvia Market</Link>
        <div className="max-w-lg">
          <p className="mb-4 text-sm text-[var(--muted)]">A marketplace built on a clear split</p>
          <h2 className="text-5xl font-extrabold leading-tight tracking-[-0.03em]">Every order is split fairly.</h2>
          <div className="mt-10 rounded-[14px] border border-[var(--line)] bg-black p-6">
            <p className="mb-5 text-sm text-[var(--muted)]">A sample Rs. 1,000 order</p>
            <SplitBar vendor={900} platform={100} label="Sample order" />
            <div className="mt-5 flex justify-between text-sm">
              <span>Rs. 900 to the seller</span><span>Rs. 100 platform fee</span>
            </div>
          </div>
          <p className="mt-4 text-sm text-[var(--muted)]">Every checkout shows where your money goes.</p>
        </div>
        <p className="text-sm text-[var(--muted)]">Prices and stock are confirmed at checkout.</p>
      </section>
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
        <Link href="/" className="tap-target mb-8 inline-flex items-center text-lg font-bold lg:hidden">Nexvia Market</Link>
          <h1 className="text-3xl font-extrabold tracking-[-0.03em]">{title}</h1>
          <p className="mt-2 text-[var(--muted)]">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 border-t border-[var(--line)] pt-5 text-sm text-[var(--muted)]">{footer}</div>
        </div>
      </section>
    </main>
  );
}
