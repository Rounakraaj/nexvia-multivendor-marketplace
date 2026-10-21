import Link from "next/link";
import SidebarNav from "@/components/SidebarNav";
import SignOutButton from "@/components/SignOutButton";

type Props = { roleLabel: string; name: string; nav: { href: string; label: string; exact?: boolean }[]; children: React.ReactNode };

export default function DashboardShell({ roleLabel, name, nav, children }: Props) {
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-[var(--line)] bg-[var(--surface-1)] lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[248px] lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4">
          <div><Link href="/" className="tap-target inline-flex items-center text-lg font-bold">Nexvia Market</Link><p className="mt-1 text-sm text-[var(--muted)]">{roleLabel}</p></div>
          <div className="lg:hidden"><SignOutButton /></div>
        </div>
        <div className="px-3 pb-3 lg:flex-1"><SidebarNav items={nav} /></div>
        <div className="hidden border-t border-[var(--line)] p-4 lg:block">
          <Link href="/" className="tap-target mb-2 flex items-center text-sm text-[var(--muted)] hover:text-[var(--text)]">View storefront</Link>
          <p className="truncate text-sm font-semibold">{name}</p><p className="mb-3 text-sm text-[var(--muted)]">{roleLabel}</p><SignOutButton />
        </div>
      </aside>
      <div className="min-w-0 flex-1"><main className="mx-auto max-w-[1100px] px-5 py-8 lg:px-10 lg:py-10">{children}</main></div>
    </div>
  );
}
